const userModel = require("../models/user.model");
const deviceModel = require("../models/device.model");
const { updateSshPermissions } = require("./ssh-provision.service");
const { Client } = require("ssh2"); // Para pkill

async function killUserProcesses(username, device) {
    if (!device || !device.sshDetails || !device.sshDetails.sshHost || !username) return;

    const script = `pkill -KILL -u ${username} || true`;
    const client = new Client();

    return new Promise((resolve) => {
        client.on("ready", () => {
            client.exec(script, (err, stream) => {
                if (err) { client.end(); return resolve(); }
                stream.on("close", () => { client.end(); resolve(); });
            });
        }).on("error", () => resolve())
          .connect({
            host: device.sshDetails.sshHost,
            port: device.sshDetails.sshPort || 22,
            username: device.sshDetails.sshRootUsername || "root",
            password: device.sshDetails.sshRootPassword || ""
          });
    });
}

async function checkAndApplySshPermissions(fastify) {
    const now = new Date();
    fastify.log.debug("Scheduler: Checking SSH permissions for reservations...");

    try {
        const users = await userModel.find({
            "reservationRequest.status": "ACCEPTED",
            "reservationRequest.weekStart": { $lte: now },
            "reservationRequest.weekEnd": { $gte: now }
        }).exec();

        for (const user of users) {
            const deviceId = user.reservationRequest.deviceId || user.device;
            if (!deviceId) {
                fastify.log.warn(`User ${user.username} has an accepted reservation but no device assigned.`);
                continue;
            }

            const device = await deviceModel.findOne({ deviceId }).exec();
            if (!device) {
                fastify.log.error(`Device ${deviceId} not found for user ${user.username}'s reservation.`);
                continue;
            }

            const sshUsername = user.sshAccount?.sshUsername;
            if (!sshUsername) {
                fastify.log.warn(`User ${user.username} has an accepted reservation but no SSH username.`);
                continue;
            }

            // Activate permissions if not already active
            if (!user.sshAccount.canExecute) {
                fastify.log.info(`Activating SSH execution for ${user.username} on ${deviceId}.`);
                await updateSshPermissions({ device, studentUsername: sshUsername, canExecute: true });
                user.sshAccount.canExecute = true;
                await user.save();
            }
        }

        // Check for expired reservations
        const expiredUsers = await userModel.find({
            "reservationRequest.status": "ACCEPTED",
            "reservationRequest.weekEnd": { $lt: now },
            "sshAccount.canExecute": true // Only process if permissions were active
        }).exec();

        for (const user of expiredUsers) {
            const deviceId = user.reservationRequest.deviceId || user.device;
            const device = await deviceModel.findOne({ deviceId }).exec();
            const sshUsername = user.sshAccount?.sshUsername;

            if (sshUsername && device) {
                fastify.log.info(`Revoking SSH execution for ${user.username} on ${deviceId} (reservation expired).`);
                await killUserProcesses(sshUsername, device); // Kill processes first
                await updateSshPermissions({ device, studentUsername: sshUsername, canExecute: false });
                user.sshAccount.canExecute = false;
                // Optionally, reset reservationRequest status to NONE or mark as handled
                user.reservationRequest.status = "NONE";
                user.reservationRequest.handledAt = now;
                await user.save();
            }
        }
    } catch (error) {
        fastify.log.error(`Scheduler error: ${error.message}`);
    }
}

module.exports = async function (fastify, opts) {
    // Run every 5 minutes
    setInterval(() => checkAndApplySshPermissions(fastify), 5 * 60 * 1000);
    // Run immediately on startup
    checkAndApplySshPermissions(fastify);
};
