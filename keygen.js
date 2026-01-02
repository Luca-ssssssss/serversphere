const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔐 ServerSphere Key Generator');
console.log('==============================\n');

// Generiere sichere Zufallsschlüssel
const keys = {
  JWT_SECRET: crypto.randomBytes(64).toString('hex'),
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  CSRF_SECRET: crypto.randomBytes(32).toString('hex')
};

console.log('✅ Folgende Schlüssel wurden generiert:\n');

Object.entries(keys).forEach(([key, value]) => {
  console.log(`${key}=${value}`);
});

console.log('\n📝 Erstelle .env Datei...');

try {
  // Erstelle .env Datei von Template
  const templatePath = path.join(__dirname, '.env.template');
  const envPath = path.join(__dirname, '.env');
  
  if (!fs.existsSync(templatePath)) {
    console.log('❌ .env.template nicht gefunden! Erstelle neue...');
    // Erstelle einfache .env
    let envContent = '# ServerSphere Configuration\n\n';
    Object.entries(keys).forEach(([key, value]) => {
      envContent += `${key}=${value}\n`;
    });
    envContent += '\nPORT=3000\nHOST=localhost\nNODE_ENV=development\n';
    fs.writeFileSync(envPath, envContent, 'utf8');
  } else {
    let envContent = fs.readFileSync(templatePath, 'utf8');
    
    // Ersetze Platzhalter
    Object.entries(keys).forEach(([key, value]) => {
      const placeholder = `${key}=your-${key.toLowerCase().replace(/_/g, '-')}-change-immediately`;
      const newValue = `${key}=${value}`;
      
      if (envContent.includes(placeholder)) {
        envContent = envContent.replace(placeholder, newValue);
      } else {
        envContent += `\n${newValue}`;
      }
    });
    
    fs.writeFileSync(envPath, envContent, 'utf8');
  }
  
  console.log('✅ .env Datei erfolgreich erstellt!');
  console.log('📍 Pfad:', envPath);
  
  // Erstelle keys Verzeichnis
  const keysDir = path.join(__dirname, 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
    console.log('✅ keys Verzeichnis erstellt');
  }
  
} catch (error) {
  console.error('❌ Fehler:', error.message);
  console.log('\n📋 Manuell diese Zeilen in .env einfügen:');
  Object.entries(keys).forEach(([key, value]) => {
    console.log(`${key}=${value}`);
  });
  console.log('PORT=3000');
  console.log('HOST=localhost');
  console.log('NODE_ENV=development');
}

console.log('\n🎉 Key-Generierung abgeschlossen!');
console.log('==================================');