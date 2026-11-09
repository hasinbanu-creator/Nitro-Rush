import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') {
    const phaserPath = path.resolve('Backend/scratch/node_modules/phaser/index.js');
    return {
      url: pathToFileURL(phaserPath).href,
      shortCircuit: true,
      format: 'module'
    };
  }

  // If relative specifier without extension, try appending .ts or .js
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const parentURL = context.parentURL;
    let basePath = '';
    if (parentURL && parentURL.startsWith('file://')) {
      basePath = path.dirname(fileURLToPath(parentURL));
    } else {
      basePath = process.cwd();
    }
    const resolvedPath = path.resolve(basePath, specifier);
    if (!fs.existsSync(resolvedPath)) {
      if (fs.existsSync(resolvedPath + '.ts')) {
        return {
          url: pathToFileURL(resolvedPath + '.ts').href,
          shortCircuit: true
        };
      }
      if (fs.existsSync(resolvedPath + '.js')) {
        return {
          url: pathToFileURL(resolvedPath + '.js').href,
          shortCircuit: true
        };
      }
      if (fs.existsSync(path.join(resolvedPath, 'index.ts'))) {
        return {
          url: pathToFileURL(path.join(resolvedPath, 'index.ts')).href,
          shortCircuit: true
        };
      }
    }
  }

  return nextResolve(specifier, context);
}
