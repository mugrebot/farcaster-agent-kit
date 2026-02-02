#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔒 Security Check for Farcaster Agent Kit');
console.log('=========================================\n');

let issues = 0;
let warnings = 0;

// Files that should NEVER be committed
const sensitiveFiles = [
    '.env',
    'data/token.json',
    'data/profile.json',
    'data/registration.txt',
    'data/webhook_config.json'
];

// Patterns to search for in code
const secretPatterns = [
    {
        pattern: /NEYNAR_API_KEY\s*=\s*["'][^"']+["']/g,
        name: 'Hardcoded Neynar API Key'
    },
    {
        pattern: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
        name: 'UUID (possible API key)',
        warning: true
    },
    {
        pattern: /sk_[a-zA-Z0-9]{32,}/g,
        name: 'Secret Key'
    },
    {
        pattern: /pk_[a-zA-Z0-9]{32,}/g,
        name: 'Private Key'
    },
    {
        pattern: /0x[a-fA-F0-9]{64}/g,
        name: 'Ethereum Private Key',
        warning: true
    }
];

// Check .gitignore
console.log('📋 Checking .gitignore...');
if (!fs.existsSync('.gitignore')) {
    console.log('❌ CRITICAL: .gitignore not found!');
    issues++;
} else {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    const requiredEntries = ['.env', 'data/', '*.key', '*.pem'];

    requiredEntries.forEach(entry => {
        if (!gitignore.includes(entry)) {
            console.log(`⚠️  Warning: '${entry}' not in .gitignore`);
            warnings++;
        }
    });

    if (warnings === 0) {
        console.log('✅ .gitignore properly configured');
    }
}

// Check for sensitive files
console.log('\n📁 Checking for sensitive files...');
sensitiveFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        // Check if it would be committed
        try {
            const { execSync } = require('child_process');
            const gitStatus = execSync(`git status --porcelain ${file} 2>/dev/null`, { encoding: 'utf8' });

            if (gitStatus && !gitStatus.includes('??')) {
                console.log(`❌ CRITICAL: ${file} is staged for commit!`);
                issues++;
            } else {
                console.log(`✅ ${file} exists but ignored by git`);
            }
        } catch (e) {
            console.log(`ℹ️  ${file} exists (not in git repo)`);
        }
    }
});

// Scan source files for secrets
console.log('\n🔍 Scanning source files for secrets...');
const scanDirectory = (dir, level = 0) => {
    if (level > 3) return; // Max depth
    if (dir.includes('node_modules')) return;
    if (dir.includes('.git')) return;

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDirectory(fullPath, level + 1);
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.md'))) {
            // Skip example and template files
            if (file.includes('.example') || file.includes('template')) {
                return;
            }

            const content = fs.readFileSync(fullPath, 'utf8');

            secretPatterns.forEach(({ pattern, name, warning }) => {
                const matches = content.match(pattern);
                if (matches) {
                    // Filter out example values
                    const realMatches = matches.filter(m =>
                        !m.includes('your-') &&
                        !m.includes('example') &&
                        !m.includes('xxx') &&
                        !m.includes('0000')
                    );

                    if (realMatches.length > 0) {
                        if (warning) {
                            console.log(`⚠️  Warning: Possible ${name} in ${fullPath}`);
                            warnings++;
                        } else {
                            console.log(`❌ CRITICAL: ${name} found in ${fullPath}`);
                            issues++;
                        }
                    }
                }
            });
        }
    });
};

scanDirectory('.');

// Check environment variables
console.log('\n🔐 Checking environment variables...');
if (process.env.NEYNAR_API_KEY) {
    console.log('⚠️  Warning: NEYNAR_API_KEY is set in environment');
    console.log('   Make sure not to commit any scripts that echo env vars');
}

// Summary
console.log('\n' + '='.repeat(45));
console.log('📊 Security Check Summary:');
console.log(`   Critical Issues: ${issues}`);
console.log(`   Warnings: ${warnings}`);

if (issues > 0) {
    console.log('\n❌ CRITICAL ISSUES FOUND!');
    console.log('   Fix these before deploying to GitHub');
    process.exit(1);
} else if (warnings > 0) {
    console.log('\n⚠️  Some warnings found');
    console.log('   Review these before deploying');
    process.exit(0);
} else {
    console.log('\n✅ All security checks passed!');
    console.log('   Safe to deploy to GitHub');
    process.exit(0);
}