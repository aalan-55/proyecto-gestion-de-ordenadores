const {Schema, model} = require("mongoose")
const deviceSchema = new Schema({
    cpuUsage: Number, 
    gpuUsage: Number, 
    memoryUsage: Number,

    deviceId: {
        type: String,
        
        unique: true,
        required: true
    },
    
    processList: Array,
    gpuProcessList: Array,

    totalUsers: Number,
    lastInfoTime: Date,

    // Información necesaria para provisionar usuarios/credenciales en el equipo remoto
    // Nota: no devolvemos sshRootPassword al frontend (ver toSafeObject)
    sshDetails: {
        sshHost: { type: String, default: "" },
        sshPort: { type: Number, default: 22 },
        sshRootUsername: { type: String, default: "root" },
        sshRootPassword: { type: String, default: "" }
    }
})

deviceSchema.methods.toSafeObject = function() {
    const device = this.toObject();

    delete device.__v;
    delete device._id;

    if (device.sshDetails) {
        // Nunca exponer credenciales sensibles en la API del frontend
        delete device.sshDetails.sshRootPassword;
    }

    return device
}

module.exports = model("Device", deviceSchema);