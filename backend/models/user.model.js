const {Schema, model} = require("mongoose");
const userSchema = new Schema({
    level: {
        type: Number, 
        required: true
    },
    email: {
        type: String,

        trim: true,
        unique: true,

        required: true
    },

    course: {
        type: String, 
        default: "",
        required: function() {
            return String(this.project || "").toLowerCase() === "trabajo final";
        }
    },
    motives: {
        type: String, 
        required: true
    },

    project: {
        type: String,
        required: true
    },

    username: {
        type: String, 
        required: true
    },
    password: {
        type: String, 
        required: true
    },

    device: String,

    // Reserva asignada (histórica / manual)
    reservationStart: Date,
    reservationEnd: Date,
    reservationAccepted: { type: Boolean, default: false },

    // Flujo de solicitud semanal (usuario -> admin)
    reservationRequest: {
        weekStart: Date, // lunes 00:00
        weekEnd: Date,   // domingo 23:59:59.999
        reason: String,
        type: {
            type: String,
            enum: ["NONE", "ACCOUNT", "WEEKLY"],
            default: "NONE"
        },
        status: {
            type: String,
            enum: ["NONE", "PENDING", "ACCEPTED", "DECLINED", "CANCELLED"],
            default: "NONE"
        },
        adminNote: String,
        deviceId: String,
        requestedAt: Date,
        handledAt: Date
    },

    reservationHistory: [
        {
            device: String,
            start: Date,
            end: Date,
            reason: String,
            adminNote: String,
            status: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // Archivo del anteproyecto (Word/PDF) aportado por el alumno.
    // Guardamos metadatos + ubicación interna para poder descargarlo desde la API.
    anteproyecto: {
        filename: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        storagePath: { type: String, default: "" },
        uploadedAt: { type: Date }
    },

    // Cuenta/credenciales que se crean en el equipo remoto para que el alumno
    // pueda iniciar sesión vía SSH.
    sshAccount: {
        sshUsername: { type: String, default: "" },
        sshPassword: { type: String, default: "" },
        deviceId: { type: String, default: "" },
        createdAt: { type: Date },
        canExecute: { type: Boolean, default: false }
    }
},  { timestamps: true })

userSchema.methods.toSafeObject = function() {
    const user = this.toObject();

    delete user.__v;
    delete user._id;
    delete user.password;
    if (user.sshAccount) {
        // Nunca exponer contraseñas SSH a la UI
        delete user.sshAccount.sshPassword;
    }

    return user
}

module.exports = model("User", userSchema)