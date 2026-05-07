const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = './'; // Source folder
const outputDir = './decrypted'; // Destination for obfuscated files
const excludeDirs = ['node_modules', 'logs', 'dist', 'public' , '.gitignore' , '.git']; // Directories to skip

const obfuscateFile = (inputPath, outputPath) => {
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    execSync(`javascript-obfuscator "${inputPath}" --output "${outputPath}" \
        --compact true \
        --control-flow-flattening true \
        --dead-code-injection true \
        --debug-protection true \
        --disable-console-output true \
        --string-array-encoding "rc4" \
        --string-array-threshold 1.0`);

    console.log(`✅ Obfuscated: ${inputPath} → ${outputPath}`);
};

const copyFile = (inputPath, outputPath) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(inputPath, outputPath);
    console.log(`📂 Copied: ${inputPath} → ${outputPath}`);
};

const processDirectory = (inputDir, outputDir) => {
    fs.readdirSync(inputDir).forEach(file => {
        const fullInputPath = path.join(inputDir, file);
        const fullOutputPath = path.join(outputDir, file);

        // Skip excluded directories
        if (excludeDirs.includes(file)) return;

        if (fs.statSync(fullInputPath).isDirectory()) {
            processDirectory(fullInputPath, fullOutputPath); // Recursively process subdirectories
        } else if (file.endsWith('.js') && !file.endsWith('.obs.js')) {
            obfuscateFile(fullInputPath, fullOutputPath);
        } else {
            copyFile(fullInputPath, fullOutputPath); // Copy all other files
        }
    });
};

// Start processing
processDirectory(rootDir, outputDir);
console.log('🚀 All JavaScript files obfuscated and other files copied to "decrypted" folder!');
