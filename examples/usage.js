const { capture } = require('../src');

async function examples() {
    console.log('=== Capture avec detection auto de navbar ===\n');

    // Exemple 1: Utilisation basique (auto-detection)
    const result = await capture({ app: 'firefox' });
    console.log('Basique:', result.navBarDetected, result.navBarHeight);
}

examples().catch(console.error);