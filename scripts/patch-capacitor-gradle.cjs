// scripts/patch-capacitor-gradle.cjs
const fs = require('fs');
const path = require('path');

// 1. Leemos package.json para obtener las versiones de Capacitor
const pkgJsonPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

// Función auxiliar para obtener la versión de una dependencia
function getVersion(depName) {
    const src =
        (pkg.dependencies && pkg.dependencies[depName]) ||
        (pkg.devDependencies && pkg.devDependencies[depName]) ||
        (pkg.peerDependencies && pkg.peerDependencies[depName]);

    if (!src) {
        throw new Error(`No se encontró la dependencia ${depName} en package.json`);
    }

    // Quitamos ^ o ~ si existen
    return src.replace(/^[~^]/, '');
}

// 2. Mapeamos las versiones que necesitamos
const versions = {
    core: getVersion('@capacitor/core'),
    app: getVersion('@capacitor/app'),
    haptics: getVersion('@capacitor/haptics'),
    keyboard: getVersion('@capacitor/keyboard'),
    statusBar: getVersion('@capacitor/status-bar'),
};

// 3. Vaciar capacitor.settings.gradle
const capacitorSettingsPath = path.join('android', 'capacitor.settings.gradle');
if (fs.existsSync(capacitorSettingsPath)) {
    fs.writeFileSync(
        capacitorSettingsPath,
        '// Patched by patch-capacitor-gradle.cjs - se usan dependencias Maven de Capacitor\n',
        'utf8'
    );
    console.log('capacitor.settings.gradle limpiado');
} else {
    console.warn('No se encontró android/capacitor.settings.gradle');
}

// 4. Parchar android/app/build.gradle
const appBuildGradlePath = path.join('android', 'app', 'build.gradle');
if (fs.existsSync(appBuildGradlePath)) {
    let buildGradle = fs.readFileSync(appBuildGradlePath, 'utf8');

    // Si ya está parcheado, no hacemos nada
    if (!buildGradle.includes('com.capacitorjs:core')) {
        buildGradle = buildGradle.replace(
            /implementation\s+project\(['"]:capacitor-android['"]\)/,
            `implementation "com.capacitorjs:core:${versions.core}"`
        );
        fs.writeFileSync(appBuildGradlePath, buildGradle, 'utf8');
        console.log('app/build.gradle parcheado con com.capacitorjs:core');
    } else {
        console.log('app/build.gradle ya contenía com.capacitorjs:core');
    }
} else {
    console.warn('No se encontró android/app/build.gradle');
}

// 5. Parchar android/app/capacitor.build.gradle
const capBuildGradlePath = path.join('android', 'app', 'capacitor.build.gradle');
if (fs.existsSync(capBuildGradlePath)) {
    let capGradle = fs.readFileSync(capBuildGradlePath, 'utf8');

    // Solo parcheamos si aún tiene los "project(':capacitor-...')"
    if (capGradle.includes("project(':capacitor-app'")) {
        capGradle = capGradle
            .replace(
                /implementation\s+project\(['"]:capacitor-app['"]\)/,
                `implementation "com.capacitorjs:app:${versions.app}"`
            )
            .replace(
                /implementation\s+project\(['"]:capacitor-haptics['"]\)/,
                `implementation "com.capacitorjs:haptics:${versions.haptics}"`
            )
            .replace(
                /implementation\s+project\(['"]:capacitor-keyboard['"]\)/,
                `implementation "com.capacitorjs:keyboard:${versions.keyboard}"`
            )
            .replace(
                /implementation\s+project\(['"]:capacitor-status-bar['"]\)/,
                `implementation "com.capacitorjs:status-bar:${versions.statusBar}"`
            );

        fs.writeFileSync(capBuildGradlePath, capGradle, 'utf8');
        console.log('app/capacitor.build.gradle parcheado con dependencias Maven de plugins');
    } else {
        console.log('app/capacitor.build.gradle ya estaba parcheado');
    }
} else {
    console.warn('No se encontró android/app/capacitor.build.gradle');
}
