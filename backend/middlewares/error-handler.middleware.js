const { HttpError } = require("../classes/http-error.class")
/** @type {require('fastify').FastifyErrorHandler} */

const errorHandler = async (_error, request, response) => {
    request.log.error(_error);

    if (_error instanceof HttpError) {
        return response.status(_error.statusCode).send({
            success: false,
            code: _error.code,
            message: _error.message,
        })
    }

    if (_error.validation) {
        return response.status(400).send({
            success: false,
            code: "ERROR_VALIDACION",

            message: "Invalid input data",
            details: _error.validation
        })
    }

    if (_error?.code === "FST_REQ_FILE_TOO_LARGE" || _error?.code === "FST_FILES_LIMIT") {
        const defaultMaxMb = 100;
        const parsedMaxUploadMb = Number(process.env.MAX_UPLOAD_FILE_MB);
        const maxUploadMb = Number.isFinite(parsedMaxUploadMb) && parsedMaxUploadMb > 0
            ? parsedMaxUploadMb
            : defaultMaxMb;

        return response.status(413).send({
            success: false,
            code: "FICHERO_DEMASIADO_GRANDE",
            message: `El fichero supera el tamaño máximo permitido (${maxUploadMb} MB).`
        });
    }

    return response.status(500).send({
        success: false,
        message: process.env.MODE === "PROD" ? "Internal Server Error" : _error.message,
        stack: process.env.MODE === "DEV" ? _error.stack : undefined,
    });
}

module.exports = { errorHandler }