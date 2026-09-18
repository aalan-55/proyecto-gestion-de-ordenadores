// fastify: https://fastify.dev/docs/latest/
// mongoose: https://mongoosejs.com/

/**
 * IMPORTANTE : CAMBIAR en .ENV el "MODE" de "DEV" a "PROD" para la version final.
*/

// declaracion de variables e modulos

const DEFAULT_MAX_UPLOAD_MB = 100;
const parsedMaxUploadMb = Number(process.env.MAX_UPLOAD_FILE_MB);
const maxUploadMb = Number.isFinite(parsedMaxUploadMb) && parsedMaxUploadMb > 0
    ? parsedMaxUploadMb
    : DEFAULT_MAX_UPLOAD_MB;
const maxUploadBytes = Math.floor(maxUploadMb * 1024 * 1024);

const fastify = require("fastify")({
    logger: { level: "debug" },
    // Se aplica también a payloads grandes y mantiene coherencia con multipart.
    bodyLimit: maxUploadBytes
}) // para ver si algo pasa mal al iniciar
const mongoose = require("mongoose")

const { errorHandler } = require("./middlewares/error-handler.middleware");
const { notFoundHandler } = require("./middlewares/not-found-middleware");

require("dotenv").config()

fastify.register(require("@fastify/cors"), {
    origin: "*", 
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "username"]
});
fastify.register(require("@fastify/cookie"));
fastify.register(require("@fastify/multipart"), {
    limits: {
        fileSize: maxUploadBytes,
        files: 1,
        fields: 20
    }
});

fastify.register(require("@fastify/websocket")); // usaremos websockets para manter una connexion estable entre los equipos y el servidor, para poder solicitar la informacion del equipo
fastify.register(require("@fastify/jwt"), { secret: process.env.JWT_SECRET });
// schemas para validar las solicitudes y no acpetar solicitudes

fastify.addSchema(require("./schemas/login.schema"));
fastify.addSchema(require("./schemas/reserve.schema"));
fastify.addSchema(require("./schemas/register.schema"));

// limitar solicitudes por si acaso

fastify.register(require("@fastify/rate-limit"), {
    max: 100, 
    timeWindow: "1 minute", 

    keyGenerator: (request) => request.ip,
    errorRespondeBuilder: (request, context) => {
        return {
            statusCode: 429,
            error: "Demasiadas solicitudes",

            message: `Solo puedes hacer ${context.max} solicitudes por ${context.after}.`,
            date: new Date(),

            expiresIn: context.ttl
        }
    }
})

fastify.setErrorHandler(errorHandler);
fastify.setNotFoundHandler(notFoundHandler);

// Ejecutar rutas

fastify.register(require("./routes/auth.route"));
fastify.register(require("./routes/device.route"));
fastify.register(require("./routes/reserve.route"));
fastify.register(require("./routes/activity.route"));
fastify.register(require("./services/scheduler.service")); // Nuevo servicio de scheduler

fastify.get("/", function(request, response) {
    return response.status(200).send("OK");
})

async function connectDatabase() {
    try {
        await mongoose.connect(`${process.env.MONGO_DB_URL}`);
        fastify.log.info("Connectado con exito a mongoDB");
    } catch(_error) {
        fastify.log.error(`Error connectando a mongoDB: ${_error}`);
    }
}

async function startServer() {
    try {
        await connectDatabase();
        await fastify.listen({ port: process.env.PORT, host: "0.0.0.0" })
    } catch(_error) {
        fastify.log.error(`No se pudo iniciar el servidor: ${_error}`);
        process.exit(1)
    }
}

startServer();
