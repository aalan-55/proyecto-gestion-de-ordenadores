/**
 * Encapsulates the routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
*/

const userModel = require("../models/user.model");
const deviceModel = require("../models/device.model");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { HttpError } = require("../classes/http-error.class");
const { verifyAuthAccess } = require("../middlewares/user-access.middleware");

const { provisionStudentSsh, updateSshPermissions } = require("../services/ssh-provision.service");
const { sendEmail } = require("../services/email.service");

function startOfIsoWeek(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  // normalizar a medianoche local
  const atMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // JS: 0=domingo..6=sábado. Queremos lunes.
  const day = atMidnight.getDay();
  const diff = (day + 6) % 7; // lunes ->0, domingo->6
  atMidnight.setDate(atMidnight.getDate() - diff);
  return atMidnight;
}

function endOfIsoWeek(weekStart) {
  if (!weekStart) return null;
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function generateRandomDigits(length = 16) {
    let digits = "";
    while (digits.length < length) {
        const chunk = crypto.randomInt(0, 10).toString();
        digits += chunk;
    }
    return digits.slice(0, length);
}

async function routes(fastify, options) {
    const reserveSchema = fastify.getSchema("ReserveSchema");

    // Usuario solicita reserva semanal (reserve = cualquier fecha de esa semana, o yyyy-mm-dd)
    fastify.post(
        "/reserve/request",
        { preHandler: verifyAuthAccess, schema: reserveSchema },
        async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level == 1) throw new HttpError("ADMIN_NO_SOLICITA_RESERVA", 401);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVÁLIDO", 400);

        const { reason, reserve } = rawBody;
        if (!reason || !reserve) throw new HttpError("DATOS_INVALIDOS", 400);

        const foundUser = await userModel.findOne({ _id: userData.id }).exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);

        const weekStart = startOfIsoWeek(reserve);
        if (!weekStart) throw new HttpError("FECHA_RESERVA_INVALIDA", 400);
        const weekEnd = endOfIsoWeek(weekStart);

        // si ya tiene una solicitud pendiente para la misma semana, no duplicar
        const currentReq = foundUser.reservationRequest || {};
        if (currentReq.status === "PENDING") {
            throw new HttpError("YA_HAY_SOLICITUD_PENDIENTE", 409);
        }
        // si ya tiene una reserva aceptada activa (semana no finalizada), no permitir otra solicitud
        if (currentReq.status === "ACCEPTED") {
            const activeEnd = currentReq.weekEnd || foundUser.reservationEnd;
            if (activeEnd) {
                const now = new Date();
                const endDate = new Date(activeEnd);
                if (!Number.isNaN(endDate.getTime()) && now < endDate) {
                    throw new HttpError("RESERVA_ACTIVA", 409);
                }
            }
        }

        foundUser.reservationRequest = {
            weekStart,
            weekEnd,
            reason: String(reason).trim(),
            type: "WEEKLY",
            status: "PENDING",
            adminNote: "",
            deviceId: "",
            requestedAt: new Date(),
            handledAt: null
        };

        // limpiamos la reserva anterior para que el estudiante vea la solicitud
        foundUser.reservationStart = null;
        foundUser.reservationEnd = null;
        foundUser.reservationAccepted = false;

        await foundUser.save();
        return response.status(200).send({ success: true, reservationRequest: foundUser.reservationRequest });
      }
    );

    // Usuario cancela una solicitud pendiente
    fastify.delete("/reserve/request", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level == 1) throw new HttpError("ADMIN_NO_CANCELA_SOLICITUD", 401);

        const foundUser = await userModel.findOne({ _id: userData.id }).exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);

        const currentReq = foundUser.reservationRequest || {};
        if (currentReq.status !== "PENDING") {
            throw new HttpError("NO_HAY_SOLICITUD_PENDIENTE", 400);
        }

        foundUser.reservationHistory = foundUser.reservationHistory || [];
        
        // Si tiene cuenta SSH, quitamos permisos de ejecución
        if (foundUser.sshAccount && foundUser.sshAccount.sshUsername) {
            const device = await deviceModel.findOne({ deviceId: foundUser.device });
            if (device) {
                await updateSshPermissions({ device, studentUsername: foundUser.sshAccount.sshUsername, canExecute: false });
            }
        }

        foundUser.reservationHistory.unshift({
            device: currentReq.deviceId || null,
            start: currentReq.weekStart || null,
            end: currentReq.weekEnd || null,
            reason: currentReq.reason || "",
            adminNote: currentReq.adminNote || "",
            status: "CANCELLED"
        });
        foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);

        foundUser.reservationRequest = {
            weekStart: null,
            weekEnd: null,
            reason: "",
            type: "NONE",
            status: "CANCELLED",
            adminNote: "",
            deviceId: "",
            requestedAt: currentReq.requestedAt || new Date(),
            handledAt: new Date()
        };

        // dejamos la vista limpia
        foundUser.reservationStart = null;
        foundUser.reservationEnd = null;
        foundUser.reservationAccepted = false;

        await foundUser.save();
        return response.status(200).send({ success: true });
    });

    // Usuario cancela una reserva ya aceptada (de su solicitud semanal)
    fastify.delete("/reserve/cancel", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level == 1) throw new HttpError("ADMIN_NO_CANCELA_RESERVA", 401);

        const foundUser = await userModel.findOne({ _id: userData.id }).exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);

        const currentReq = foundUser.reservationRequest || {};
        if (currentReq.status !== "ACCEPTED") {
            throw new HttpError("NO_HAY_RESERVA_ACEPTADA", 400);
        }

        // no permitir cancelar si la semana ya terminó
        const activeEnd = currentReq.weekEnd || foundUser.reservationEnd;
        if (activeEnd) {
            const now = new Date();
            const endDate = new Date(activeEnd);
            if (!Number.isNaN(endDate.getTime()) && now >= endDate) {
                throw new HttpError("RESERVA_FINALIZADA", 400);
            }
        }

        foundUser.reservationHistory = foundUser.reservationHistory || [];

        // Quitar permisos de ejecución al finalizar/cancelar reserva activa
        if (foundUser.sshAccount && foundUser.sshAccount.sshUsername) {
            const device = await deviceModel.findOne({ deviceId: foundUser.device });
            if (device) {
                await updateSshPermissions({ device, studentUsername: foundUser.sshAccount.sshUsername, canExecute: false });
            }
        }

        foundUser.reservationHistory.unshift({
            device: currentReq.deviceId || foundUser.device || null,
            start: currentReq.weekStart || foundUser.reservationStart || null,
            end: currentReq.weekEnd || foundUser.reservationEnd || null,
            reason: currentReq.reason || "",
            adminNote: currentReq.adminNote || "",
            status: "CANCELLED"
        });
        foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);

        foundUser.reservationRequest.status = "CANCELLED";
        foundUser.reservationRequest.type = "NONE";
        foundUser.reservationRequest.weekStart = null;
        foundUser.reservationRequest.weekEnd = null;
        foundUser.reservationRequest.reason = "";
        foundUser.reservationRequest.adminNote = "";
        foundUser.reservationRequest.deviceId = "";
        foundUser.reservationRequest.handledAt = null;
        foundUser.reservationRequest.requestedAt = null;

        foundUser.reservationStart = null;
        foundUser.reservationEnd = null;
        foundUser.reservationAccepted = false;

        await foundUser.save();
        return response.status(200).send({ success: true });
    });

    // Admin: listar solicitudes pendientes
    fastify.get("/reserve/requests", { preHandler: verifyAuthAccess }, async (request, response) => {
        const adminData = request.user;
        if (!adminData) throw new HttpError("SESSION_INVALIDA", 401);
        if (adminData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const users = await userModel
            .find({ "reservationRequest.status": "PENDING" })
            .select({
                username: 1,
                email: 1,
                course: 1,
                motives: 1,
                project: 1,
                device: 1,
                reservationRequest: 1
            })
            .lean()
            .exec();

        return response.status(200).send(users || []);
    });

    // Admin: aceptar/rechazar solicitud (puede indicar deviceId)
    fastify.post("/reserve/handle/:user", { preHandler: verifyAuthAccess }, async (request, response) => {
        const adminData = request.user;

        if (!adminData) throw new HttpError("SESSION_INVALIDA", 401);
        if (adminData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const requestedUser = request.params.user;
        if (!requestedUser) throw new HttpError("USUARIO_INVALIDO", 400);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVÁLIDO", 400);

        const { action, adminNote, deviceId } = rawBody;
        if (!action) throw new HttpError("METODO_INVALIDO", 400);

        const foundUser = await userModel
            .findOne({ $or: [{ email: requestedUser }, { username: requestedUser }] })
            .exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);

        const currentReq = foundUser.reservationRequest || {};
        if (currentReq.status !== "PENDING") {
            throw new HttpError("USUARIO_SIN_SOLICITUD_PENDIENTE", 400);
        }
        const requestTypeRaw = String(currentReq.type || "").toUpperCase();
        const looksLikeRegistrationRequest =
            !foundUser.reservationAccepted &&
            !!String(foundUser?.anteproyecto?.storagePath || "").trim();
        const requestType =
            requestTypeRaw || (looksLikeRegistrationRequest ? "ACCOUNT" : "WEEKLY");

        const weekStart = currentReq.weekStart;
        const weekEnd = currentReq.weekEnd;
        if (!weekStart || !weekEnd) throw new HttpError("SOLICITUD_CORRUPTA", 400);

        const normalizedAction = String(action).toUpperCase();
        if (normalizedAction !== "ACCEPT" && normalizedAction !== "DECLINE") {
            throw new HttpError("ACCION_INVALIDA", 400);
        }

        const adminNoteTrim = adminNote ? String(adminNote).trim() : "";

        // Si acepta: equipo obligatorio + límites (16 por semana total, 2 por equipo)
        let finalDeviceId = "";
        if (normalizedAction === "ACCEPT") {
            const userHasDevice = !!foundUser.device;
            if (userHasDevice) {
                finalDeviceId = String(foundUser.device).trim();
            } else {
                finalDeviceId = deviceId ? String(deviceId).trim() : "";
                if (!finalDeviceId) throw new HttpError("EQUIPO_OBLIGATORIO_PARA_ACEPTAR", 400);
            }

            const acceptedThisWeek =
                requestType === "WEEKLY"
                    ? await userModel.countDocuments({
                        "reservationRequest.status": "ACCEPTED",
                        "reservationRequest.weekStart": weekStart,
                        $or: [
                            { "reservationRequest.type": "WEEKLY" },
                            { "reservationRequest.type": { $exists: false } },
                            { "reservationRequest.type": "" }
                        ]
                    })
                    : 0;

            if (acceptedThisWeek >= 16) {
                throw new HttpError("SEMANA_SIN_PLAZAS", 409);
            }

            const foundDevice = await deviceModel.findOne({
                deviceId: { $regex: new RegExp(`^${finalDeviceId}$`, "i") }
            });
            if (!foundDevice) throw new HttpError("DISPOSITIVO_NO_ENCONTRADO", 404);
            finalDeviceId = foundDevice.deviceId;

            // Crear usuario/contraseña SSH del alumno en el equipo remoto (best-effort).
            // Si falta sshHost u otro dato del equipo, no bloqueamos la aceptación.
            const emailLocalPart = String(foundUser.email || "").split("@")[0];
            const sshUsername = emailLocalPart.split(".")[0] || `u${String(foundUser._id || "").slice(-8)}`;
            let provisionResult = null;
            try {
                provisionResult = await provisionStudentSsh({
                    device: foundDevice,
                    studentUsername: sshUsername
                });
                // Habilitar ejecución al aceptar
                if (provisionResult) {
                    await updateSshPermissions({ device: foundDevice, studentUsername: sshUsername, canExecute: true });
                }
            } catch (sshErr) {
                fastify.log.error(
                    `No se pudo provisionar SSH para ${foundUser.username}: ${sshErr?.message || sshErr}`
                );
            }

            foundUser.device = finalDeviceId;
            foundUser.reservationAccepted = true;
            let generatedPlatformPassword = "";

            const handledAt = new Date();
            if (requestType === "ACCOUNT") {
                generatedPlatformPassword = generateRandomDigits(16);
                foundUser.password = await bcrypt.hash(generatedPlatformPassword, 12);
                foundUser.reservationRequest = {
                    weekStart: null,
                    weekEnd: null,
                    reason: "",
                    type: "NONE",
                    status: "NONE",
                    adminNote: "",
                    deviceId: "",
                    requestedAt: null,
                    handledAt: null
                };
                foundUser.reservationStart = null;
                foundUser.reservationEnd = null;

                foundUser.reservationHistory = foundUser.reservationHistory || [];
                foundUser.reservationHistory.unshift({
                    device: finalDeviceId || null,
                    start: handledAt,
                    end: null,
                    reason: "",
                    adminNote: adminNoteTrim || "",
                    status: "ACCOUNT_CREATED"
                });
                foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);
            } else {
                foundUser.reservationRequest.status = "ACCEPTED";
                foundUser.reservationRequest.type = "WEEKLY";
                foundUser.reservationRequest.adminNote = adminNoteTrim;
                foundUser.reservationRequest.deviceId = finalDeviceId;
                foundUser.reservationRequest.handledAt = handledAt;

                foundUser.reservationStart = new Date(weekStart);
                foundUser.reservationEnd = new Date(weekEnd);

                // Si ya tenía cuenta SSH previa, habilitamos ejecución para la nueva reserva
                if (foundUser.sshAccount && foundUser.sshAccount.sshUsername) {
                    await updateSshPermissions({ device: foundDevice, studentUsername: foundUser.sshAccount.sshUsername, canExecute: true });
                }

                foundUser.reservationHistory = foundUser.reservationHistory || [];
                foundUser.reservationHistory.unshift({
                    device: finalDeviceId || null,
                    start: weekStart,
                    end: weekEnd,
                    reason: currentReq.reason || "",
                    adminNote: adminNoteTrim || "",
                    status: "ACCEPTED"
                });
                foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);
            }

            if (provisionResult?.studentUsername && provisionResult?.studentPassword) {
                foundUser.sshAccount = {
                    sshUsername: provisionResult.studentUsername,
                    sshPassword: provisionResult.studentPassword,
                    deviceId: finalDeviceId,
                    canExecute: true, // Se acaba de habilitar en el proceso de provisión
                    createdAt: new Date()
                };
            }

            await foundUser.save();

            // Enviar correo al alumno (best-effort):
            // - Siempre notifica que su solicitud fue aceptada/registrada.
            // - Incluye credenciales SSH solo si se pudieron provisionar.
            try {
                const sshHost = foundDevice?.sshDetails?.sshHost || finalDeviceId;
                const sshPort = foundDevice?.sshDetails?.sshPort || 22;
                const hasSshCredentials =
                    !!provisionResult?.studentUsername && !!provisionResult?.studentPassword;

                await sendEmail({
                    to: foundUser.email,
                    subject:
                        requestType === "ACCOUNT"
                            ? "Alta de cuenta aprobada"
                            : "Reserva semanal aceptada",
                    text: [
                        requestType === "ACCOUNT"
                            ? "Tu solicitud de alta ha sido aceptada y tu cuenta ya esta activa."
                            : "Tu solicitud semanal ha sido aceptada.",
                        ...(requestType === "ACCOUNT"
                            ? [
                                "",
                                "Credenciales de acceso a la plataforma:",
                                `Usuario: ${foundUser.username}`,
                                `Contraseña temporal: ${generatedPlatformPassword}`
                            ]
                            : []),
                        "",
                        `Equipo asignado: ${finalDeviceId}`,
                        ...(hasSshCredentials
                            ? [
                                "",
                                "Credenciales SSH:",
                                `Host: ${sshHost}`,
                                `Puerto: ${sshPort}`,
                                `Usuario: ${provisionResult.studentUsername}`,
                                `Contraseña: ${provisionResult.studentPassword}`,
                                "",
                                "Puedes consultar la guía de uso en nuestra wiki para orientarte:",
                                "https://reservasdie.uv.es/wiki/PGIM1.html"
                            ]
                            : [
                                "",
                                "El acceso SSH se configurará por el administrador.",
                                "",
                                "Puedes consultar la guía de uso en nuestra wiki para orientarte:",
                                "https://reservasdie.uv.es/wiki/PGIM1.html"
                            ]),
                        ...(adminNoteTrim
                            ? [
                                "",
                                `Nota del administrador: ${adminNoteTrim}`
                            ] : [])
                    ].join("\n"),
                    html: `
                        <p>${
                            requestType === "ACCOUNT"
                                ? "Tu solicitud de alta ha sido aceptada y tu cuenta ya esta activa."
                                : "Tu solicitud semanal ha sido aceptada."
                        }</p>
                        ${
                            requestType === "ACCOUNT"
                                ? `
                        <p><strong>Credenciales de acceso a la plataforma</strong></p>
                        <ul>
                          <li><strong>Usuario:</strong> ${foundUser.username}</li>
                          <li><strong>Contraseña temporal:</strong> ${generatedPlatformPassword}</li>
                        </ul>
                        `
                                : ""
                        }
                        <p>Equipo asignado: <strong>${finalDeviceId}</strong></p>
                        ${
                            hasSshCredentials
                                ? `
                        <p><strong>Credenciales SSH</strong></p>
                        <ul>
                          <li><strong>Host:</strong> ${sshHost}</li>
                          <li><strong>Puerto:</strong> ${sshPort}</li>
                          <li><strong>Usuario:</strong> ${provisionResult.studentUsername}</li>
                          <li><strong>Contraseña:</strong> ${provisionResult.studentPassword}</li>
                        </ul>
                        <p>Puedes consultar la guía de uso en nuestra <a href="https://reservasdie.uv.es/wiki/PGIM1.html">wiki</a> para orientarte.</p>
                        `
                                : `
                        <p>El acceso SSH se configurará por el administrador.</p>
                        <p>Puedes consultar la guía de uso en nuestra <a href="https://reservasdie.uv.es/wiki/PGIM1.html">wiki</a> para orientarte.</p>
                        `
                        }
                        ${
                            adminNoteTrim
                                ? `<p><strong>Nota del administrador:</strong> ${adminNoteTrim}</p>`
                                : ""
                        }
                    `
                });
            } catch (emailErr) {
                fastify.log.error(
                    `Error enviando correo al alumno (${foundUser.email}): ${emailErr?.message || emailErr}`
                );
            }

            return response.status(200).send({ success: true });
        }

        // DECLINE
        if (requestType === "ACCOUNT") {
            // Rechazo de alta: borrar por completo usuario + anteproyecto.
            const storagePath = String(foundUser?.anteproyecto?.storagePath || "").trim();
            if (storagePath) {
                try {
                    const absolutePath = path.join(__dirname, "..", storagePath);
                    await fs.promises.unlink(absolutePath);
                } catch (fileErr) {
                    if (fileErr?.code !== "ENOENT") {
                        fastify.log.error(
                            `No se pudo borrar anteproyecto de ${foundUser.username}: ${fileErr?.message || fileErr}`
                        );
                    }
                }
            }

            await foundUser.deleteOne();
            return response.status(200).send({ success: true });
        }

        // Rechazo de reserva semanal: conservar usuario y registrar el resultado.
        foundUser.reservationRequest.status = "DECLINED";
        foundUser.reservationRequest.type = "WEEKLY";
        foundUser.reservationRequest.adminNote = adminNoteTrim;
        foundUser.reservationRequest.deviceId = "";
        foundUser.reservationRequest.handledAt = new Date();

        foundUser.reservationAccepted = false;
        foundUser.reservationStart = null;
        foundUser.reservationEnd = null;

        foundUser.reservationHistory = foundUser.reservationHistory || [];
        foundUser.reservationHistory.unshift({
            device: null,
            start: weekStart,
            end: weekEnd,
            reason: currentReq.reason || "",
            adminNote: adminNoteTrim || "",
            status: "DECLINED"
        });
        foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);

        await foundUser.save();
        return response.status(200).send({ success: true });
    });

    // Alumno: historial de sus reservas
    fastify.get("/reserve/my-history", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level == 1) throw new HttpError("REQUIRE_ESTUDIANTE", 401);

        const foundUser = await userModel
            .findOne({ _id: userData.id })
            .select({ reservationHistory: 1 })
            .lean()
            .exec();

        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);
        return response.status(200).send((foundUser.reservationHistory || []).slice(0, 10));
    });
}

module.exports = routes;