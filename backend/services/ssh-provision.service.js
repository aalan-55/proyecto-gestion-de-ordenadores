const { Client } = require("ssh2");
const crypto = require("crypto");

function shellEscapeSingleQuotes(value) {
    // Escapa para usarse dentro de '...'
    return String(value).replace(/'/g, "'\\''");
}

function generatePassword(length = 16) {
    // A prueba de caracteres problemáticos al hacer copy/paste
    const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let out = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

function buildProvisionScript({ studentUsername, studentPassword }) {
    // Usuario sin sudo (solo cuenta SSH).
    // Nota: asumimos que la máquina remota permite password auth en SSH.
    const u = shellEscapeSingleQuotes(studentUsername);
    const p = shellEscapeSingleQuotes(studentPassword);

    return [
        "set -e",
        // Creamos el grupo si no existe
        "groupadd -f estudiantes",
        `if ! id -u '${u}' >/dev/null 2>&1; then`,
        // Usamos rbash para restringir movimientos
        `  useradd -m -g estudiantes -s /bin/rbash '${u}'`,
        "fi",
        `echo '${u}:${p}' | chpasswd`,
        // Fase 1: Denegar ejecución en su home (recursivo)
        `find /home/${u} -type f -exec chmod 600 {} +`,
        `find /home/${u} -type d -exec chmod 700 {} +`
    ].join("\n");
}

/**
 * Genera un script para habilitar o deshabilitar la ejecución de archivos del alumno.
 * Mantiene permisos de ejecución en directorios para permitir el acceso (cd).
 */
function buildToggleExecutionScript({ studentUsername, canExecute }) {
    const u = shellEscapeSingleQuotes(studentUsername);
    if (canExecute) {
        // Otorgar ejecución recursivamente (directorios y archivos)
        return `chmod -R u+x /home/${u} 2>/dev/null || true`;
    } else {
        // Quitar ejecución solo a los ficheros para que no puedan correr binarios/scripts
        // pero permitir ejecución en directorios para que SFTP/ls sigan funcionando.
        return `find /home/${u} -type f -exec chmod u-x {} + 2>/dev/null || true`;
    }
}

async function updateSshPermissions({ device, studentUsername, canExecute }) {
    if (!device || !device.sshDetails || !device.sshDetails.sshHost || !studentUsername) return;

    const script = buildToggleExecutionScript({ studentUsername, canExecute });
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

async function execRemote({ device, studentUsername, studentPassword }) {
    const { sshHost, sshPort, sshRootUsername, sshRootPassword } =
        device || {};

    if (!sshHost) throw new Error("Falta sshHost en device.");

    const client = new Client();

    const script = buildProvisionScript({
        studentUsername,
        studentPassword
    });

    return new Promise((resolve, reject) => {
        client
            .on("ready", () => {
                client.exec(script, { pty: false }, (err, stream) => {
                    if (err) {
                        client.end();
                        return reject(err);
                    }

                    let stdout = "";
                    let stderr = "";

                    stream.on("data", (data) => {
                        stdout += data.toString("utf8");
                    });
                    stream.stderr.on("data", (data) => {
                        stderr += data.toString("utf8");
                    });

                    stream.on("close", (code) => {
                        client.end();

                        if (code !== 0) {
                            return reject(
                                new Error(
                                    `SSH provision falló (code=${code}). stderr=${stderr}`
                                )
                            );
                        }
                        resolve({ stdout, stderr });
                    });
                });
            })
            .on("error", (e) => {
                reject(e);
            })
            .connect({
                host: sshHost,
                port: sshPort || 22,
                username: sshRootUsername || "root",
                password: sshRootPassword || ""
            });
    });
}

async function provisionStudentSsh({ device, studentUsername }) {
    const studentPassword = generatePassword(16);
    await execRemote({
        device,
        studentUsername,
        studentPassword
    });

    return { studentUsername, studentPassword };
}

module.exports = {
    provisionStudentSsh,
    generatePassword,
    updateSshPermissions
};
