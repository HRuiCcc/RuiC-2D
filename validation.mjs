import fs from 'node:fs/promises';
import vm from 'node:vm';
const context={TextEncoder,TextDecoder};vm.createContext(context);
vm.runInContext(await fs.readFile(new URL('./public/vendor/mesh-avatar.js',import.meta.url),'utf8'),context);
export const validateRig=value=>context.MeshAvatar.validateRig(value);
