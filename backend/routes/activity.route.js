const deviceModel = require("../models/device.model");
const userModel = require("../models/user.model");
const { verifyAuthAccess } = require("../middlewares/user-access.middleware");
const { HttpError } = require("../classes/http-error.class");
const {
    persistDeviceTelemetry,
    buildActivitySummary
} = require("../services/activity.service");

function ensureSocketState(fastify) {
    if (!fastify.activitySocketState) {
        fastify.activitySocketState = {
            adminSockets: new Set(),
            deviceSocketsById: new Map()
        };
    }
    return fastify.activitySocketState;
}

function safeSend(socket, payload) {
    try {
        socket.send(JSON.stringify(payload));
    } catch (_error) {
        // ignore broken sockets
    }
}

function broadcastAdmins(state, payload) {
    for (const socket of state.adminSockets) {
        safeSend(socket, payload);
    }
}

function requestTelemetryToDevices(state, targetDeviceId, requestId) {
    let totalTargets = 0;
    for (const [deviceId, sockets] of state.deviceSocketsById.entries()) {
        if (targetDeviceId && deviceId !== targetDeviceId) continue;
        totalTargets += sockets.size;
        for (const socket of sockets) {
            safeSend(socket, {
                type: "collect_now",
                requestId,
                requestedAt: new Date().toISOString()
            });
        }
    }
    return totalTargets;
}

async function routes(fastify) {
    const state = ensureSocketState(fastify);

    fastify.get(
        "/ws/activity",
        { websocket: true },
        async (socket, request) => {
            const role = String(request.query?.role || "").trim().toLowerCase();
            let socketDeviceId = "";

            if (role === "device") {
                const apiKey = String(request.query?.apiKey || "").trim();
                const deviceId = String(request.query?.deviceId || "").trim();
                if (!apiKey || apiKey !== process.env.API_KEY || !deviceId) {
                    safeSend(socket, { type: "error", code: "AUTH_ERROR" });
                    socket.close();
                    return;
                }

                const foundDevice = await deviceModel.findOne({ deviceId }).lean().exec();
                if (!foundDevice) {
                    safeSend(socket, { type: "error", code: "DEVICE_NOT_FOUND" });
                    socket.close();
                    return;
                }

                socketDeviceId = deviceId;
                const set = state.deviceSocketsById.get(deviceId) || new Set();
                set.add(socket);
                state.deviceSocketsById.set(deviceId, set);
                safeSend(socket, { type: "connected", role: "device", deviceId });
                broadcastAdmins(state, {
                    type: "device_online",
                    deviceId,
                    connectedAt: new Date().toISOString()
                });
            } else if (role === "admin") {
                const token = String(request.query?.token || "").trim();
                if (!token) {
                    safeSend(socket, { type: "error", code: "AUTH_ERROR" });
                    socket.close();
                    return;
                }

                let decoded = null;
                try {
                    decoded = await fastify.jwt.verify(token);
                } catch (_error) {
                    safeSend(socket, { type: "error", code: "AUTH_ERROR" });
                    socket.close();
                    return;
                }

                if (!decoded || Number(decoded.level) !== 1) {
                    safeSend(socket, { type: "error", code: "FORBIDDEN" });
                    socket.close();
                    return;
                }

                state.adminSockets.add(socket);
                safeSend(socket, {
                    type: "connected",
                    role: "admin",
                    onlineDevices: [...state.deviceSocketsById.keys()]
                });
            } else {
                safeSend(socket, { type: "error", code: "INVALID_ROLE" });
                socket.close();
                return;
            }

            socket.on("message", async (rawMsg) => {
                let msg = null;
                try {
                    msg = JSON.parse(String(rawMsg || "{}"));
                } catch (_error) {
                    safeSend(socket, { type: "error", code: "BAD_JSON" });
                    return;
                }

                if (role === "device") {
                    if (msg?.type !== "telemetry") return;
                    try {
                        const saved = await persistDeviceTelemetry({
                            ...msg.payload,
                            deviceId: socketDeviceId
                        });
                        safeSend(socket, {
                            type: "telemetry_ack",
                            capturedAt: saved.capturedAt
                        });
                        broadcastAdmins(state, {
                            type: "telemetry_update",
                            deviceId: saved.deviceId,
                            capturedAt: saved.capturedAt
                        });
                    } catch (error) {
                        safeSend(socket, {
                            type: "error",
                            code: "TELEMETRY_ERROR",
                            message: error?.message || "TELEMETRY_ERROR"
                        });
                    }
                    return;
                }

                if (msg?.type === "request_latest") {
                    const requestId = String(msg.requestId || Date.now());
                    const targetDeviceId = msg.deviceId
                        ? String(msg.deviceId).trim()
                        : "";
                    const sent = requestTelemetryToDevices(state, targetDeviceId, requestId);
                    safeSend(socket, { type: "request_ack", requestId, sent });
                }
            });

            socket.on("close", () => {
                state.adminSockets.delete(socket);
                if (socketDeviceId) {
                    const set = state.deviceSocketsById.get(socketDeviceId);
                    if (set) {
                        set.delete(socket);
                        if (!set.size) {
                            state.deviceSocketsById.delete(socketDeviceId);
                            broadcastAdmins(state, {
                                type: "device_offline",
                                deviceId: socketDeviceId,
                                disconnectedAt: new Date().toISOString()
                            });
                        }
                    }
                }
            });
        }
    );

    // Alumno: Ver estadísticas actuales de su dispositivo asignado
    fastify.get(
        "/device-activity/my-device",
        { preHandler: verifyAuthAccess },
        async (request, response) => {
            const userData = request.user;
            if (!userData) throw new HttpError("SESSION_INVALIDA", 401);

            const foundUser = await userModel.findOne({ _id: userData.id }).lean().exec();
            if (!foundUser || !foundUser.device) {
                return response.status(200).send(null);
            }

            const summary = await buildActivitySummary({
                deviceId: foundUser.device,
                onlineDeviceIds: [...state.deviceSocketsById.keys()]
            });

            return response.status(200).send(summary.devices[0] || null);
        }
    );

    fastify.get(
        "/device-activity/summary",
        { preHandler: verifyAuthAccess },
        async (request, response) => {
            const userData = request.user;
            if (!userData) throw new HttpError("SESSION_INVALIDA", 401);
            if (Number(userData.level) !== 1) throw new HttpError("REQUIRE_ADMINISTRADOR", 401);

            const deviceId = request.query?.deviceId
                ? String(request.query.deviceId).trim()
                : "";
            const onlineDeviceIds = [...state.deviceSocketsById.keys()];
            const startDate = request.query?.startDate ? new Date(request.query.startDate) : null;
            const endDate = request.query?.endDate ? new Date(request.query.endDate) : null;

            const summary = await buildActivitySummary({
                deviceId,
                onlineDeviceIds,
                startDate,
                endDate
            });
            return response.status(200).send(summary);
        }
    );
}

module.exports = routes;
