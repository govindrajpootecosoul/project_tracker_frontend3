const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');

function runCommand(command, description, allowFailure = false) {
  console.log(`\n[build] ${description}...`);
  try {
    execSync(command, { 
      cwd: rootDir, 
      stdio: 'inherit',
      shell: true
    });
    console.log(`[build] ✓ ${description} completed successfully`);
    return true;
  } catch (error) {
    if (allowFailure) {
      console.log(`[build] ⚠ ${description} skipped (non-critical)`);
      return false;
    }
    console.error(`[build] ✗ ${description} failed`);
    if (error.status !== undefined) {
      console.error(`[build] Exit code: ${error.status}`);
    }
    if (error.message) {
      console.error(`[build] Error: ${error.message}`);
    }
    process.exit(1);
  }
}

try {
  // Step 1: Try to generate Prisma client (non-critical - may already be generated)
  // This is faster than always generating, but ensures it exists if needed
  const prismaClientPath = path.join(rootDir, 'node_modules', '.prisma', 'client', 'index.js');
  const needsPrisma = !fs.existsSync(prismaClientPath);
  
  if (needsPrisma) {
    console.log('\n[build] Prisma client not found, generating...');
    runCommand('npx prisma generate', 'Prisma generate', true); // Allow failure
  } else {
    console.log('\n[build] Prisma client already exists, skipping generation');
  }
  
  // Step 2: Next.js build (critical)
  runCommand('next build', 'Next.js build', false);
  
  console.log('\n[build] ✓ Build completed successfully!');
} catch (error) {
  console.error('[build] Build failed:', error.message);
  process.exit(1);
}

