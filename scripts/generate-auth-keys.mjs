import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { writeFileSync } from "node:fs";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

writeFileSync("jwt_private_key.tmp", privateKey.trimEnd().replace(/\n/g, " "), "utf8");
writeFileSync("jwks.tmp", jwks, "utf8");
console.log("Wrote jwt_private_key.tmp and jwks.tmp");
