/**
 * Encapsulates the routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
*/
const bcrypt = require("bcrypt");

const { Resend } = require("resend");
const resendHandler = new Resend(process.env.RESEND_API_KEY);
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendEmail } = require("../services/email.service");

const userModel = require("../models/user.model");
const deviceModel = require("../models/device.model");
const { HttpError } = require("../classes/http-error.class");

const { verifyAuthAccess } = require("../middlewares/user-access.middleware");

function normalizeBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.replace(/\/+$/, "");
}

function resolvePublicAppUrl(request) {
    const fromEnv =
        normalizeBaseUrl(process.env.PUBLIC_APP_URL) ||
        normalizeBaseUrl(process.env.FRONTEND_URL) ||
        normalizeBaseUrl(process.env.APP_URL);

    if (fromEnv) return fromEnv;

    const originHeader = normalizeBaseUrl(request?.headers?.origin);
    if (originHeader) return originHeader;

    return "http://localhost:5173";
}

function isDeliverableEmail(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return false;

    const blockedDomains = new Set([
        "example.com",
        "example.org",
        "example.net",
        "test.com",
        "mailinator.com"
    ]);
    const domain = email.split("@")[1] || "";
    return !blockedDomains.has(domain);
}

function uniqueEmails(emails) {
    const seen = new Set();
    const list = [];
    for (const rawEmail of emails || []) {
        const email = String(rawEmail || "").trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        list.push(email);
    }
    return list;
}

function usernameFromEmail(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    const [localPart = ""] = email.split("@");
    const normalized = localPart.replace(/[^a-z0-9._-]/g, "");
    return normalized;
}

function isAlumniUvEmail(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    return Boolean(email) && email.endsWith("@alumni.uv.es");
}

function isUvEmail(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    return Boolean(email) && email.endsWith("@uv.es");
}

async function routes(fastify, options) {
    const loginSchema = fastify.getSchema("LoginSchema");

    fastify.get("/me", { preHandler: verifyAuthAccess }, async (request, response) => {
        const foundUser = await userModel.findOne({ _id: request.user.id });
        if (!foundUser) throw new HttpError("SESIÓN_INVÁLIDA", 401);

        return response.send(foundUser.toSafeObject());
    });
    fastify.patch("/update", {preHandler: verifyAuthAccess}, async (request, response) => {
        const rawBody = request.body; 
        if (!rawBody) throw new HttpError("CUERPO_SOLICITUD_INVÁLIDA", 401); 

        const userData = request.user;
        if (!userData) throw new HttpError("INICIA_SESIÓN", 401);

        if (userData.level != 1) { 
            const foundUser = await userModel.findOne({username: userData.username }).exec()
            if (!foundUser) throw new HttpError("USUARIO_NO_VÁLIDO", 401); 

            const oldPassword = foundUser.password; 
            const newPassword = rawBody.newPassword; 
            const passWordMatch = await bcrypt.compare(newPassword, oldPassword);
            
            if (passWordMatch) {
                return response.status(400).send({ success: false, code: "MISMA_CONTRASEÑA", message: "La contraseña no puede ser igual que la antigua." })
            }else {
                const pwHash = await bcrypt.hash(newPassword, 12);
                foundUser.password = pwHash;

                await foundUser.save();
                return response.status(200).send("Contraseña cambiada.")
            }
        }else {
            const user = request.headers.username;
            if (user) {
                const foundUser = await userModel.findOne({$or: [ { email: user }, { username: user } ]}).exec()
                if (!foundUser) throw new HttpError("USUARIO_NO_VÁLIDO", 401); 

                const oldPassword = foundUser.password; 
                const newPassword = rawBody.newPassword; 
                const passWordMatch = await bcrypt.compare(newPassword, oldPassword);

                if (passWordMatch) {
                    return response.status(400).send({ success: false, code: "MISMA_CONTRASEÑA", message: "La contraseña no puede ser igual que la antigua." })
                }else {
                    const pwHash = await bcrypt.hash(newPassword, 12);
                    foundUser.password = pwHash;

                    await foundUser.save();
                    return response.status(200).send("Contraseña cambiada.")
                }
            }else {
                const foundUser = await userModel.findOne({username: userData.username }).exec()
                if (!foundUser) throw new HttpError("USUARIO_NO_VÁLIDO", 401); 

                const oldPassword = foundUser.password; 
                const newPassword = rawBody.newPassword; 
                const passWordMatch = await bcrypt.compare(newPassword, oldPassword);

                if (passWordMatch) {
                    return response.status(400).send({ success: false, code: "MISMA_CONTRASEÑA", message: "La contraseña no puede ser igual que la antigua." })
                }else {
                    const pwHash = await bcrypt.hash(newPassword, 12);
                    foundUser.password = pwHash;
                    
                    await foundUser.save();
                    return response.status(200).send("Contraseña cambiada.")
                }
            }
        }
    })

    fastify.patch("/reset-password", { preHandler: verifyAuthAccess }, async (request, response) => {
        const adminData = request.user;
        if (!adminData) throw new HttpError("SESSION_INVALIDA", 401);
        if (adminData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_SOLICITUD_INVALIDA", 401);

        const { userName, newPassword } = rawBody;
        if (!userName || !newPassword) {
            throw new HttpError("CUERPO_SOLICITUD_INVALIDA", 401);
        }

        const foundUser = await userModel
            .findOne({ $or: [{ email: userName }, { username: userName }] })
            .exec();

        if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 401);

        const pwHash = await bcrypt.hash(newPassword, 12);
        if (!pwHash) throw new HttpError("ERROR_INTERNO", 401);

        foundUser.password = pwHash;
        await foundUser.save();

        return response.status(200).send("Contraseña restablecida.");
    })

    fastify.get("/users", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const users = await userModel
          .find({ level: { $ne: 1 } })
          .select({
            username: 1,
            email: 1,
            device: 1,
            reservationStart: 1,
            reservationEnd: 1,
            course: 1,
            project: 1,
            motives: 1,
            level: 1,
            reservationRequest: 1
          })
          .lean()
          .exec();

        const devices = await deviceModel
          .find({})
          .select({ deviceId: 1 })
          .lean()
          .exec();

        const existingIds = new Set(
          devices.map((d) => String(d.deviceId || "").trim().toLowerCase())
        );

        const normalizeId = (value) =>
          String(value || "").trim().toLowerCase();

        const safeUsers = users.map((u) => {
          const hasDevice =
            u.device && existingIds.has(normalizeId(u.device));

          return {
            username: u.username,
            email: u.email,
            device: hasDevice ? u.device : null,
            reservationStart: hasDevice ? u.reservationStart || null : null,
            reservationEnd: hasDevice ? u.reservationEnd || null : null,
            course: u.course,
            project: u.project,
            motives: u.motives,
            level: u.level,
            reservationRequest: u.reservationRequest
              ? {
                  status: u.reservationRequest.status || "NONE",
                  reason: u.reservationRequest.reason || "",
                  adminNote: u.reservationRequest.adminNote || ""
                }
              : null
          };
        });

        return response.status(200).send(safeUsers);
    })

    fastify.get("/users/history", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level != 1) throw new HttpError("REQUIERE_ADMINISTRADOR", 401);

        const { userName } = request.query || {};
        if (!userName) throw new HttpError("CUERPO_INVALIDO", 401);

        const foundUser = await userModel
          .findOne({ $or: [{ email: userName }, { username: userName }] })
          .select({ reservationHistory: 1 })
          .lean()
          .exec();

        if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 401);

        return response.status(200).send((foundUser.reservationHistory || []).slice(0, 10));
    })

    fastify.delete("/users", { preHandler: verifyAuthAccess }, async (request, response) => {
        const adminData = request.user;
        if (!adminData) throw new HttpError("SESSION_INVALIDA", 401);
        if (adminData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401);

        const { userName } = rawBody;
        if (!userName) throw new HttpError("CUERPO_INVALIDO", 401);

        const foundUser = await userModel
          .findOne({ $or: [{ email: userName }, { username: userName }] })
          .exec();

        if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 401);
        if (foundUser.level === 1) throw new HttpError("NO_PUEDE_BORRAR_ADMIN", 401);

        if (foundUser.device) {
          await deviceModel.updateOne(
            { deviceId: foundUser.device },
            { $inc: { totalUsers: -1 } }
          );
        }

        await foundUser.deleteOne();

        return response.status(200).send("Usuario eliminado correctamente.");
    })

    // Admin: descargar/visualizar el anteproyecto subido por el alumno
    fastify.get("/anteproyecto/:userId", { preHandler: verifyAuthAccess }, async (request, response) => {
        const adminData = request.user;
        if (!adminData) throw new HttpError("SESSION_INVALIDA", 401);
        if (adminData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const { userId } = request.params || {};
        if (!userId) throw new HttpError("CUERPO_INVALIDO", 400);

        const foundUser = await userModel
            .findOne({ $or: [{ email: userId }, { username: userId }] })
            .select({ anteproyecto: 1 })
            .exec();

        if (!foundUser) throw new HttpError("USUARIO_NO_ENCONTRADO", 404);
        if (!foundUser.anteproyecto || !foundUser.anteproyecto.storagePath) {
            throw new HttpError("ANTEproyecto_NO_ENCONTRADO", 404);
        }

        const absolutePath = path.join(__dirname, "..", foundUser.anteproyecto.storagePath);
        if (!fs.existsSync(absolutePath)) {
            throw new HttpError("FICHERO_NO_ENCONTRADO", 404);
        }

        const filename = foundUser.anteproyecto.filename || "anteproyecto";
        const mime = foundUser.anteproyecto.mimeType || "application/octet-stream";

        response.type(mime);
        response.header("Content-Disposition", `attachment; filename="${filename}"`);
        return response.send(fs.createReadStream(absolutePath));
    })

    fastify.post("/login", { schema: loginSchema }, async (request, response) => {
        const rawBody = request.body; 
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401);

        const { username, password } = rawBody; 
        if (!username || !password) throw new HttpError("CREDENCIALES_NO_VALIDAS", 401);

        try {
            const foundUser = await userModel.findOne({$or: [ { email: username }, { username: username } ]}).exec();
            if (!foundUser) throw new HttpError("CREDENCIALES_NO_VALIDAS", 401);

            const validPassword = await bcrypt.compare(password, foundUser.password);
            if (!validPassword) throw new HttpError("CREDENCIALES_NO_VALIDAS", 401); 

            // Para estudiantes: solo se permite login cuando el admin haya aceptado
            if (foundUser.level !== 1 && !foundUser.reservationAccepted) {
                throw new HttpError(
                    "SOLICITUD_NO_ACEPTADA_POR_EL_ADMIN",
                    403
                );
            }

            const userToken = await response.jwtSign({ id: foundUser._id.toString(), username: foundUser.username, level: foundUser.level });
            return response.status(200).send({ token: userToken, _user: foundUser.toSafeObject() })
        }catch(_error) {
            if (_error instanceof HttpError) throw _error;
            throw new HttpError("ERROR_INICIO_SESSION", 500);
        }
    })
    fastify.post("/register", async (request, response) => {
        if (!request.isMultipart()) {
            throw new HttpError("CUERPO_INVALIDO", 400);
        }

        const parts = request.parts();
        const fields = {};
        let uploadedFile = null; // { buffer, filename, mimetype, fieldname }

        for await (const part of parts) {
            if (part.file) {
                uploadedFile = {
                    buffer: await part.toBuffer(),
                    filename: part.filename,
                    mimetype: part.mimetype,
                    fieldname: part.fieldname
                };
            } else {
                // Campos del formulario (string)
                fields[part.fieldname] = part.value;
            }
        }

        const { email, motives, course, requestType } = fields;
        const normalizedRequestType =
            String(requestType || "PROYECTO").trim().toUpperCase() === "INVESTIGACION"
                ? "INVESTIGACION"
                : "PROYECTO";

        if (!email) {
            throw new HttpError("DATOS_INVALIDOS", 400);
        }

        if (normalizedRequestType === "INVESTIGACION") {
            if (!isUvEmail(email)) {
                throw new HttpError("CORREO_DEBE_TERMINAR_EN_UV", 400);
            }
        } else if (!isAlumniUvEmail(email)) {
            throw new HttpError("CORREO_DEBE_SER_ALUMNI_UV", 400);
        }
        if (normalizedRequestType !== "INVESTIGACION" && !course) {
            throw new HttpError("DATOS_INVALIDOS", 400);
        }
        if (normalizedRequestType === "INVESTIGACION" && !motives) {
            throw new HttpError("DATOS_INVALIDOS", 400);
        }

        if (normalizedRequestType === "PROYECTO" && (!uploadedFile || !uploadedFile.buffer)) {
            throw new HttpError("FICHERO_ANTEproyecto_OBLIGATORIO", 400);
        }

        const originalFilename = uploadedFile ? String(uploadedFile.filename || "") : "";
        const ext = uploadedFile ? path.extname(originalFilename).toLowerCase() : "";
        const mimeType = uploadedFile ? String(uploadedFile.mimetype || "") : "";

        const isPdf = ext === ".pdf" && mimeType === "application/pdf";
        if (normalizedRequestType === "PROYECTO" && !isPdf) {
            throw new HttpError("FORMATO_ANTEproyecto_DEBE_SER_PDF", 400);
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedUsername = usernameFromEmail(normalizedEmail);
        if (!normalizedUsername) {
            throw new HttpError("CORREO_NO_VALIDO", 400);
        }

        // Comprobar duplicados antes de escribir el fichero
        const foundUser = await userModel
            .findOne({
                $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
            })
            .exec();

        if (foundUser) {
            return response.status(409).send({ message: "El usuario ya existe" });
        }

        // Se asignará una contraseña aleatoria al aceptar la solicitud.
        const pendingPassword = crypto.randomUUID();
        const pwHash = await bcrypt.hash(pendingPassword, 12);
        if (!pwHash) throw new HttpError("ERROR_INTERNO", 500);

        function startOfIsoWeek(dateLike) {
            const d = new Date(dateLike);
            if (Number.isNaN(d.getTime())) return null;
            const atMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const day = atMidnight.getDay(); // 0=domingo
            const diff = (day + 6) % 7; // lunes -> 0
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

        const weekStart = startOfIsoWeek(new Date());
        const weekEnd = endOfIsoWeek(weekStart);

        const uploadDir = path.join(__dirname, "..", "uploads", "anteproyectos");
        fs.mkdirSync(uploadDir, { recursive: true });

        const uploadId = crypto.randomUUID();
        const storedFilename = `${uploadId}.pdf`;
        const storagePath = path.join("uploads", "anteproyectos", storedFilename);
        const absolutePath = path.join(__dirname, "..", storagePath);

        if (normalizedRequestType === "PROYECTO") {
            await fs.promises.writeFile(absolutePath, uploadedFile.buffer);
        }

        const safeMotives =
            normalizedRequestType === "INVESTIGACION"
                ? String(motives).trim()
                : "Solicitud de proyecto con anteproyecto adjunto";
        const safeProject =
            normalizedRequestType === "PROYECTO"
                ? "Trabajo final"
                : "Proyecto de investigación";
        const safeCourse =
            normalizedRequestType === "INVESTIGACION" ? "" : String(course);

        const newUser = new userModel({
            email: normalizedEmail,
            motives: safeMotives,
            username: normalizedUsername,
            password: pwHash,
            course: safeCourse,
            project: safeProject,
            level: 2,
            anteproyecto: {
                filename: normalizedRequestType === "PROYECTO" ? originalFilename : "",
                mimeType: normalizedRequestType === "PROYECTO" ? mimeType : "",
                storagePath: normalizedRequestType === "PROYECTO" ? storagePath : "",
                uploadedAt: normalizedRequestType === "PROYECTO" ? new Date() : null
            },
            reservationAccepted: false,
            reservationRequest: {
                weekStart,
                weekEnd,
                reason:
                    normalizedRequestType === "INVESTIGACION"
                        ? safeMotives
                        : "Solicitud de alta para trabajo final",
                type: "ACCOUNT",
                status: "PENDING",
                adminNote: "",
                deviceId: "",
                requestedAt: new Date(),
                handledAt: null
            }
        });

        await newUser.save();

        // Responder rápido al cliente y enviar los correos en segundo plano.
        response.status(200).send("OK");

        setImmediate(async () => {
            try {
                const admins = await userModel
                    .find({ level: 1 })
                    .select({ email: 1, username: 1 })
                    .lean()
                    .exec();

                const publicAppUrl = resolvePublicAppUrl(request);
                const link = `${publicAppUrl}/panel-admin/solicitud/${encodeURIComponent(
                    normalizedUsername
                )}`;

                const adminRecipients = (admins || [])
                    .map((a) => String(a?.email || "").trim())
                    .filter((email) => isDeliverableEmail(email));

                const fallbackRecipient = String(process.env.MAIL_USERNAME || "").trim();
                const fallbackRecipients = isDeliverableEmail(fallbackRecipient)
                    ? [fallbackRecipient]
                    : [];

                const recipients = uniqueEmails([
                    ...adminRecipients,
                    ...fallbackRecipients
                ]);

                if (!recipients.length) {
                    fastify.log.warn(
                        "No hay destinatarios validos para enviar el correo de solicitud (admins ni fallback MAIL_USERNAME)."
                    );
                    return;
                }

                fastify.log.info(
                    `Enviando correo de solicitud de registro a: ${recipients.join(", ")}`
                );

                await Promise.all(
                    recipients.map((recipientEmail) =>
                            sendEmail({
                                to: recipientEmail,
                                subject: "Solicitud de alumno pendiente de aprobación",
                                text: [
                                    "Se ha registrado un nuevo alumno con solicitud pendiente.",
                                    "",
                                    `Alumno: ${normalizedUsername}`,
                                    `Correo: ${normalizedEmail}`,
                                    `Tipo: ${safeProject}`,
                                    `Motivo: ${safeMotives}`,
                                    "",
                                    "Revisa y acepta/rechaza aquí:",
                                    link
                                ].join("\n"),
                                html: `
                                    <p>Se ha registrado un nuevo alumno con solicitud pendiente.</p>
                                    <ul>
                                      <li><strong>Alumno:</strong> ${normalizedUsername}</li>
                                      <li><strong>Correo:</strong> ${normalizedEmail}</li>
                                      <li><strong>Tipo:</strong> ${safeProject}</li>
                                      <li><strong>Motivo:</strong> ${safeMotives}</li>
                                    </ul>
                                    <p>
                                      Revisa y acepta/rechaza aquí:
                                      <a href="${link}">${link}</a>
                                    </p>
                                `
                            })
                        )
                );
            } catch (emailErr) {
                fastify.log.error(
                    `No se pudo enviar correo a administradores: ${emailErr?.message || emailErr}`
                );
            }
        });
        return;

    })
}

module.exports = routes;