/**
 * Encapsulates the routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
*/

const userModel = require("../models/user.model");
const deviceModel = require("../models/device.model");
const { persistDeviceTelemetry } = require("../services/activity.service");

const { verifyAuthAccess } = require("../middlewares/user-access.middleware");
const { HttpError } = require("../classes/http-error.class");
const { updateSshPermissions } = require("../services/ssh-provision.service");

async function routes(fastify, options) {
    fastify.post("/send-info", async (request, response) => {
        const rawBody = request.body; 
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401);

        const apiKey = request.headers["Api-Key"];

        if (!apiKey) throw new HttpError("API_KEY_INVALIDA", 401);
        if (apiKey != process.env.API_KEY) throw new HttpError("API_KEY_NO_CORRECTA", 401);

        try {
            await persistDeviceTelemetry(rawBody);
        } catch (error) {
            if (error?.message === "DEVICE_NOT_FOUND") {
                throw new HttpError("DISPOSTIVO_NO_ENCONTRADO", 401);
            }
            if (error?.message === "DEVICE_ID_REQUIRED") {
                throw new HttpError("CUERPO_INVALIDO", 401);
            }
            throw error;
        }
        return response.status(200).send("OK")
    })

    fastify.get("/pc-count", {preHandler: verifyAuthAccess}, async (request, response) => {
        const userData = request.user;

        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        let totalDevices = await deviceModel.find({ });
        totalDevices = totalDevices.map(device => device.toSafeObject());

        const normalizeDeviceId = (value) =>
          String(value || "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();

        const users = await userModel
          .find({ device: { $exists: true, $ne: null } })
          .select({ username: 1, email: 1, device: 1, reservationStart: 1, reservationEnd: 1 })
          .lean()
          .exec();

        const deviceToUser = new Map();
        const deviceToReservation = new Map();
        const deviceToCount = new Map();

        for (const u of users) {
          if (!u.device) continue;

          const key = normalizeDeviceId(u.device);
          if (!key) continue;

          deviceToCount.set(key, (deviceToCount.get(key) || 0) + 1);

          if (!deviceToUser.has(key)) {
            deviceToUser.set(key, u.username || u.email || null);
            deviceToReservation.set(key, {
              reservationStart: u.reservationStart || null,
              reservationEnd: u.reservationEnd || null
            });
          }
        }

        totalDevices = totalDevices.map((d) => {
          const key = normalizeDeviceId(d.deviceId);
          const resv = deviceToReservation.get(key) || {
            reservationStart: null,
            reservationEnd: null
          };
          
          return {
            ...d,
            assignedUser: deviceToUser.get(key) || null,
            assignedCount: deviceToCount.get(key) || 0,
            reservationStart: resv.reservationStart,
            reservationEnd: resv.reservationEnd
          };
        });

        return response.status(200).send(totalDevices)
    })
    fastify.post("/add-pc", {preHandler: verifyAuthAccess}, async (request, response) => {
        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401)

        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);

        let {
            deviceName,
            sshHost,
            sshPort,
            sshRootUsername,
            sshRootPassword
        } = rawBody;
        deviceName = deviceName?.trim().replace(/\s+/g, ' ')

        if (userData.level == 1) {
            const foundDevice = await deviceModel.findOne({ deviceId: { $regex: new RegExp(`^${deviceName}$`, "i") } });
            if (foundDevice) throw new HttpError("Dispostivo ya existe.", 401);

            const newDevice = new deviceModel({
                deviceId: deviceName,
                sshDetails: {
                    sshHost: String(sshHost || "").trim(),
                    sshPort: Number(sshPort || 22),
                    sshRootUsername: String(sshRootUsername || "root").trim(),
                    sshRootPassword: String(sshRootPassword || "").trim()
                }
            });
            await newDevice.save();

            return response.status(200).send("Nuevo dispotivo creado.")
        }else {
            return response.status(401).send("Acceso solo permitdo al administrador")
        } 
    })
    fastify.post("/asign-pc", {preHandler: verifyAuthAccess}, async (request, response) => {
        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401)

        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);

        let { userName, deviceName, reservationStart, reservationEnd }= rawBody;
        deviceName = deviceName?.trim().replace(/\s+/g, ' ')

        if (userData.level == 1) {
            const foundUser = await userModel.findOne({$or: [ { email: userName }, { username: userName } ]}).exec()
            const foundDevice = await deviceModel.findOne({ deviceId: { $regex: new RegExp(`^${deviceName}$`, "i") } });

            if (!foundUser || !foundDevice) throw new HttpError("Usuario o Dispositivo Invalido.", 401);

            // guardamos el deviceId real para evitar problemas de mayúsculas/espacios
            foundUser.device = foundDevice.deviceId;

            let startDate = null;
            let endDate = null;

            if (reservationStart) {
                const d = new Date(reservationStart);
                if (!Number.isNaN(d.getTime())) startDate = d;
            }
            if (reservationEnd) {
                const d = new Date(reservationEnd);
                if (!Number.isNaN(d.getTime())) endDate = d;
            }

            if (startDate) foundUser.reservationStart = startDate;
            if (endDate) foundUser.reservationEnd = endDate;

            if (startDate || endDate) {
                foundUser.reservationHistory = foundUser.reservationHistory || [];
                foundUser.reservationHistory.unshift({
                    device: foundDevice.deviceId,
                    start: startDate,
                    end: endDate,
                    status: "ACCEPTED",
                    reason: "Asignación directa por administrador"
                });
                foundUser.reservationHistory = foundUser.reservationHistory.slice(0, 10);
            }
            foundDevice.totalUsers = (foundDevice.totalUsers || 0) + 1

            await foundUser.save();
            
            // Al asignar directamente, si ya tiene SSH, habilitamos ejecución
            if (foundUser.sshAccount && foundUser.sshAccount.sshUsername) {
                await updateSshPermissions({ device: foundDevice, studentUsername: foundUser.sshAccount.sshUsername, canExecute: true });
                foundUser.sshAccount.canExecute = true;
            }

            await foundDevice.save();

            return response.status(200).send("Dispostivo asignado a usuario con exito.")
        }else {
            return response.status(401).send("Acceso solo permitdo al administrador")
        } 
    })
    fastify.delete("/remove-pc", {preHandler: verifyAuthAccess}, async (request, response) => {
        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401)

        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);

        const { deviceName }= rawBody;

        if (userData.level == 1) {
            const foundDevice = await deviceModel.findOne({ deviceId: deviceName })
            if (!foundDevice) throw new HttpError("DISPOSTIVO_NO_ENCONTRADO", 401);

            // Limpiar asignación y reservas en los usuarios que usaban este equipo
            await userModel.updateMany(
                { device: foundDevice.deviceId },
                { $set: { device: null, reservationStart: null, reservationEnd: null } }
            );

            await foundDevice.deleteOne()

            return response.status(200).send("Dispositivo borrado y reservas asociadas eliminadas.");
        }else {
            return response.status(401).send("Acceso solo permitdo al administrador")
        } 
    })
    fastify.patch("/clear-reservation", {preHandler: verifyAuthAccess}, async (request, response) => {
        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401)

        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);

        const { userName } = rawBody;
        if (!userName) throw new HttpError("CUERPO_INVALIDO", 401)

        if (userData.level == 1) {
            const foundUser = await userModel.findOne({$or: [ { email: userName }, { username: userName } ]}).exec()
            if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 401);

            if (!foundUser.reservationStart && !foundUser.reservationEnd) {
                throw new HttpError("USUARIO_SIN_RESERVA", 400);
            }

            foundUser.reservationStart = null;
            foundUser.reservationEnd = null;
            foundUser.reservationAccepted = false;
            
            // Quitar ejecución al limpiar reserva
            if (foundUser.sshAccount && foundUser.sshAccount.sshUsername && foundUser.device) {
                const device = await deviceModel.findOne({ deviceId: foundUser.device });
                if (device) {
                    await updateSshPermissions({ device, studentUsername: foundUser.sshAccount.sshUsername, canExecute: false });
                    foundUser.sshAccount.canExecute = false;
                }
            }

            // limpiamos también el flujo semanal para evitar estados inconsistentes
            foundUser.reservationRequest = foundUser.reservationRequest || {};
            foundUser.reservationRequest.status = "NONE";
            foundUser.reservationRequest.weekStart = null;
            foundUser.reservationRequest.weekEnd = null;
            foundUser.reservationRequest.reason = "";
            foundUser.reservationRequest.adminNote = "";
            foundUser.reservationRequest.deviceId = "";
            foundUser.reservationRequest.handledAt = null;
            foundUser.reservationRequest.requestedAt = null;
            await foundUser.save();

            return response.status(200).send("Reserva eliminada para el usuario.");
        }else {
            return response.status(401).send("Acceso solo permitdo al administrador")
        } 
    })

    // Admin: reasignar (cambiar) el dispositivo de un alumno
    fastify.patch("/reassign-user-device", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401);
        const { userName, deviceId } = rawBody;
        if (!userName || !deviceId) throw new HttpError("CUERPO_INVALIDO", 401);

        const foundUser = await userModel.findOne({ $or: [{ email: userName }, { username: userName }] }).exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 404);

        const foundDevice = await deviceModel.findOne({ deviceId: { $regex: new RegExp(`^${deviceId}$`, "i") } });
        if (!foundDevice) throw new HttpError("DISPOSITIVO_NO_ENCONTRADO", 404);

        const oldDeviceId = foundUser.device ? String(foundUser.device).trim() : null;
        foundUser.device = foundDevice.deviceId;

        // Si estaba aceptada para la semana actual, actualizamos también el device en el historial.
        const req = foundUser.reservationRequest || {};
        if (req.status === "ACCEPTED" && req.weekStart && req.weekEnd) {
            foundUser.reservationRequest.deviceId = foundDevice.deviceId;
            const ws = new Date(req.weekStart).toISOString().slice(0, 10);
            const we = new Date(req.weekEnd).toISOString().slice(0, 10);

            foundUser.reservationHistory = foundUser.reservationHistory || [];
            foundUser.reservationHistory = foundUser.reservationHistory.map((h) => {
                if (!h) return h;
                if (h.status !== "ACCEPTED") return h;
                if (!h.start || !h.end) return h;
                const hs = new Date(h.start).toISOString().slice(0, 10);
                const he = new Date(h.end).toISOString().slice(0, 10);
                if (hs === ws && he === we) {
                    return { ...h, device: foundDevice.deviceId };
                }
                return h;
            });
        }

        // Actualizamos contadores del dispositivo (aprox.)
        if (oldDeviceId) {
            await deviceModel.updateOne({ deviceId: oldDeviceId }, { $inc: { totalUsers: -1 } });
        }
        await deviceModel.updateOne({ deviceId: foundDevice.deviceId }, { $inc: { totalUsers: 1 } });

        await foundUser.save();
        return response.status(200).send({ success: true });
    })

    // Admin: eliminar (desasignar) el dispositivo de un alumno
    fastify.patch("/unassign-user-device", { preHandler: verifyAuthAccess }, async (request, response) => {
        const userData = request.user;
        if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
        if (userData.level != 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

        const rawBody = request.body;
        if (!rawBody) throw new HttpError("CUERPO_INVALIDO", 401);
        const { userName } = rawBody;
        if (!userName) throw new HttpError("CUERPO_INVALIDO", 401);

        const foundUser = await userModel.findOne({ $or: [{ email: userName }, { username: userName }] }).exec();
        if (!foundUser) throw new HttpError("USUARIO_NO_VALIDO", 404);

        const oldDeviceId = foundUser.device ? String(foundUser.device).trim() : null;

        foundUser.device = null;
        foundUser.reservationStart = null;
        foundUser.reservationEnd = null;
        foundUser.reservationAccepted = false;

        // Quitar ejecución al desasignar
        if (foundUser.sshAccount && foundUser.sshAccount.sshUsername && oldDeviceId) {
            const device = await deviceModel.findOne({ deviceId: oldDeviceId });
            if (device) {
                await updateSshPermissions({ device, studentUsername: foundUser.sshAccount.sshUsername, canExecute: false });
            }
        }

        foundUser.reservationRequest = foundUser.reservationRequest || {};
        foundUser.reservationRequest.status = "NONE";
        foundUser.reservationRequest.weekStart = null;
        foundUser.reservationRequest.weekEnd = null;
        foundUser.reservationRequest.reason = "";
        foundUser.reservationRequest.adminNote = "";
        foundUser.reservationRequest.deviceId = "";
        foundUser.reservationRequest.handledAt = null;
        foundUser.reservationRequest.requestedAt = null;

        if (oldDeviceId) {
            await deviceModel.updateOne({ deviceId: oldDeviceId }, { $inc: { totalUsers: -1 } });
        }

        await foundUser.save();
        return response.status(200).send({ success: true });
    })

    // Admin: Registrar el momento en que se solicita una actualización de datos de un equipo
    fastify.post("/refresh-log", { preHandler: verifyAuthAccess }, async (request, response) => {
        const { deviceId } = request.body;
        if (!deviceId) throw new HttpError("DEVICE_ID_REQUIRED", 400);

        const foundDevice = await deviceModel.findOne({ deviceId: { $regex: new RegExp(`^${deviceId}$`, "i") } });
        if (!foundDevice) throw new HttpError("DISPOSTIVO_NO_ENCONTRADO", 404);

        const now = new Date();
        foundDevice.lastRefreshRequestAt = now;
        
        // Registramos un historial de las últimas 10 solicitudes en el documento del dispositivo
        if (!foundDevice.refreshHistory) foundDevice.refreshHistory = [];
        foundDevice.refreshHistory.unshift(now);
        if (foundDevice.refreshHistory.length > 10) foundDevice.refreshHistory.pop();
        
        await foundDevice.save();
        return response.status(200).send({ success: true, requestedAt: foundDevice.lastRefreshRequestAt });
    });
}

module.exports = routes;