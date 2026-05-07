/**
 * Server Setup Script - Nginx + Cloudflare + DDoS Protection
 *
 * Supports: Ubuntu, Debian, CentOS, RHEL, Amazon Linux, AlmaLinux, Rocky Linux, Fedora
 *
 * Usage: node serverSetup.js
 *
 * Ye script automatically:
 * 1. OS detect karega (Ubuntu/CentOS/RHEL/Amazon Linux etc.)
 * 2. Nginx install + real_ip module check karega
 * 3. Nginx me Cloudflare Real IP configure karega
 * 4. Blocked IPs include directive add karega
 * 5. errorLog folder aur nginx-blocked-ips.conf create karega
 * 6. Nginx test aur reload karega
 * 7. .env me DDOS_NGINX_BLOCK_FILE set karega
 * 8. Firewall rules set karega (ufw/firewalld)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// =============================================
// CONFIGURATION - Yahan apni details dalo
// =============================================
const CONFIG = {
  // Tumhara project ka path (jahan app.js hai)
  projectPath: '/var/www/samratking.com/api',

  // Nginx site config file ka path (auto-detect bhi karega agar blank ho)
  // Ubuntu/Debian: /etc/nginx/conf.d/  ya  /etc/nginx/sites-available/
  // CentOS/RHEL:   /etc/nginx/conf.d/
  nginxSiteConf: '/etc/nginx/conf.d/samratking.conf',

  // Nginx main config (almost always same)
  nginxMainConf: '/etc/nginx/nginx.conf',

  // Server domain jisme block karna hai
  apiServerName: 'api.samratking.com',

  // Node app port — .env se auto read hoga
  appPort: process.env.PORT || 5001,

  // Allowed origin domains — sirf in domains se OPTIONS allow hogi
  // Saare subdomains auto-allow (6wickets.pro = *.6wickets.pro bhi)
  // Script chalate waqt puchega — ya yahan daal do
   allowedOriginDomains: [],     //['6wickets.pro', 'tresting.com'],
};

// =============================================
// Cloudflare IP Ranges (latest)
// https://www.cloudflare.com/ips/
// =============================================
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

// =============================================
// DO NOT EDIT BELOW THIS LINE
// =============================================

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  white: '\x1b[37m',
};

function log(msg, color = 'green') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function logStep(step, msg) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}[Step ${step}]${COLORS.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`  ${COLORS.green}✓ ${msg}${COLORS.reset}`);
}

function logError(msg) {
  console.log(`  ${COLORS.red}✗ ${msg}${COLORS.reset}`);
}

function logWarning(msg) {
  console.log(`  ${COLORS.yellow}⚠ ${msg}${COLORS.reset}`);
}

function logInfo(msg) {
  console.log(`  ${COLORS.white}  ${msg}${COLORS.reset}`);
}

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

// =============================================
// OS Detection
// =============================================
function detectOS() {
  const platform = os.platform();

  if (platform !== 'linux') {
    return { name: platform, family: 'unknown', packageManager: null };
  }

  // Try /etc/os-release (works on most modern Linux)
  try {
    if (fs.existsSync('/etc/os-release')) {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const getId = (key) => {
        const match = osRelease.match(new RegExp(`^${key}=["']?([^"'\\n]+)`, 'm'));
        return match ? match[1].trim() : '';
      };

      const id = getId('ID').toLowerCase();
      const idLike = getId('ID_LIKE').toLowerCase();
      const name = getId('PRETTY_NAME') || getId('NAME');
      const version = getId('VERSION_ID');

      // Debian family (Ubuntu, Debian, Linux Mint, Pop!_OS, etc.)
      if (id === 'ubuntu' || id === 'debian' || idLike.includes('debian') || idLike.includes('ubuntu')) {
        return { name, version, family: 'debian', packageManager: 'apt', id };
      }

      // RHEL family (CentOS, RHEL, Fedora, Amazon Linux, AlmaLinux, Rocky)
      if (id === 'centos' || id === 'rhel' || id === 'fedora' || id === 'amzn' ||
          id === 'almalinux' || id === 'rocky' || idLike.includes('rhel') ||
          idLike.includes('centos') || idLike.includes('fedora')) {
        // Check dnf first (newer), fallback to yum
        const hasDnf = runCommand('which dnf 2>/dev/null');
        const packageManager = hasDnf ? 'dnf' : 'yum';
        return { name, version, family: 'rhel', packageManager, id };
      }

      // SUSE family
      if (id === 'sles' || id === 'opensuse' || idLike.includes('suse')) {
        return { name, version, family: 'suse', packageManager: 'zypper', id };
      }

      // Arch family
      if (id === 'arch' || idLike.includes('arch')) {
        return { name, version, family: 'arch', packageManager: 'pacman', id };
      }

      // Alpine
      if (id === 'alpine') {
        return { name, version, family: 'alpine', packageManager: 'apk', id };
      }

      return { name, version, family: 'unknown', packageManager: null, id };
    }
  } catch (e) {
    // ignore
  }

  // Fallback detection
  if (runCommand('which apt 2>/dev/null')) return { name: 'Linux (Debian-based)', family: 'debian', packageManager: 'apt' };
  if (runCommand('which dnf 2>/dev/null')) return { name: 'Linux (RHEL-based)', family: 'rhel', packageManager: 'dnf' };
  if (runCommand('which yum 2>/dev/null')) return { name: 'Linux (RHEL-based)', family: 'rhel', packageManager: 'yum' };
  if (runCommand('which zypper 2>/dev/null')) return { name: 'Linux (SUSE-based)', family: 'suse', packageManager: 'zypper' };
  if (runCommand('which pacman 2>/dev/null')) return { name: 'Linux (Arch-based)', family: 'arch', packageManager: 'pacman' };
  if (runCommand('which apk 2>/dev/null')) return { name: 'Linux (Alpine)', family: 'alpine', packageManager: 'apk' };

  return { name: 'Linux (Unknown)', family: 'unknown', packageManager: null };
}

// =============================================
// Step 1: Check root / sudo
// =============================================
function checkRoot() {
  const whoami = runCommand('whoami');
  if (whoami !== 'root') {
    logError(`Script root user se chalao! Current user: ${whoami}`);
    logError('Run: sudo node serverSetup.js');
    process.exit(1);
  }
}

// =============================================
// Step 2: Detect OS and show info
// =============================================
let OS_INFO = {};

function detectAndShowOS() {
  logStep(1, 'Detecting Operating System...');

  OS_INFO = detectOS();

  logSuccess(`OS: ${OS_INFO.name}`);
  logSuccess(`Family: ${OS_INFO.family}`);
  logSuccess(`Package Manager: ${OS_INFO.packageManager || 'not detected'}`);
  logSuccess(`Architecture: ${os.arch()}`);
  logSuccess(`Hostname: ${os.hostname()}`);

  if (OS_INFO.family === 'unknown') {
    logWarning('OS detect nahi hua. Script continue karega lekin kuch commands fail ho sakte hain.');
  }
}

// =============================================
// Step 3: Check & Install nginx
// =============================================
function checkNginx() {
  logStep(2, 'Checking nginx installation...');

  const nginxVersion = runCommand('nginx -v 2>&1');
  if (nginxVersion) {
    logSuccess(`Nginx found: ${nginxVersion}`);
  } else {
    logWarning('Nginx installed nahi hai! Installing...');

    let installCmd = null;
    switch (OS_INFO.family) {
      case 'debian':
        installCmd = 'apt update -y && apt install nginx -y';
        break;
      case 'rhel':
        // RHEL/CentOS needs EPEL for nginx
        runCommand(`${OS_INFO.packageManager} install epel-release -y 2>&1`);
        installCmd = `${OS_INFO.packageManager} install nginx -y`;
        break;
      case 'suse':
        installCmd = 'zypper install -y nginx';
        break;
      case 'arch':
        installCmd = 'pacman -S --noconfirm nginx';
        break;
      case 'alpine':
        installCmd = 'apk add nginx';
        break;
      default:
        logError('OS detect nahi hua. Manually nginx install karo.');
        process.exit(1);
    }

    const result = runCommand(`${installCmd} 2>&1`);
    if (result !== null) {
      logSuccess('Nginx installed successfully');
    } else {
      logError(`Nginx install failed. Manually run: ${installCmd}`);
      process.exit(1);
    }
  }

  // Check real_ip module
  const nginxModules = runCommand('nginx -V 2>&1');
  if (nginxModules && nginxModules.includes('http_realip_module')) {
    logSuccess('real_ip module available');
  } else {
    logWarning('real_ip module nahi mila. Installing full nginx...');

    let installCmd = null;
    switch (OS_INFO.family) {
      case 'debian':
        installCmd = 'apt install nginx-extras -y 2>&1 || apt install nginx-full -y 2>&1';
        break;
      case 'rhel':
        // RHEL nginx usually has realip built-in, try reinstall
        installCmd = `${OS_INFO.packageManager} install nginx-mod-http-perl -y 2>&1`;
        break;
      default:
        logWarning('Auto-install not available for this OS. Manually install nginx with realip module.');
        break;
    }

    if (installCmd) {
      runCommand(installCmd);
      const recheck = runCommand('nginx -V 2>&1');
      if (recheck && recheck.includes('http_realip_module')) {
        logSuccess('real_ip module now available');
      } else {
        logError('real_ip module install nahi hua. Nginx ko source se compile karna padega with --with-http_realip_module');
        process.exit(1);
      }
    }
  }

  // Enable and start nginx
  runCommand('systemctl enable nginx 2>&1');
  runCommand('systemctl start nginx 2>&1');
  logSuccess('Nginx enabled and started');
}

// =============================================
// Step 4: Nginx main config me Cloudflare Real IP add karo
// =============================================
function setupNginxMainConf() {
  logStep(3, 'Setting up Cloudflare Real IP in nginx.conf...');

  if (!fs.existsSync(CONFIG.nginxMainConf)) {
    logError(`${CONFIG.nginxMainConf} not found!`);
    process.exit(1);
  }

  // Backup
  const backupPath = `${CONFIG.nginxMainConf}.backup.${Date.now()}`;
  fs.copyFileSync(CONFIG.nginxMainConf, backupPath);
  logSuccess(`Backup: ${backupPath}`);

  let content = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');

  // ALWAYS remove old config first — fresh write har baar
  content = content.replace(/\n\s*# Cloudflare Real IP - Auto configured[\s\S]*?real_ip_recursive\s+on;\s*\n/m, '\n');
  content = content.replace(/^\s*set_real_ip_from\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*real_ip_header\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*real_ip_recursive\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*# Cloudflare Real IP.*$/gm, '');
  content = content.replace(/^\s*# IPv[46].*$/gm, '');
  // Clean extra blank lines
  content = content.replace(/\n{3,}/g, '\n\n');
  logSuccess('Old Cloudflare config removed (fresh write)');

  // Cloudflare config generate karo (IPv4 + IPv6)
  const cfLines = [
    '',
    '    # Cloudflare Real IP - Auto configured by serverSetup.js',
    '    # IPv4',
    ...CLOUDFLARE_IPV4.map(ip => `    set_real_ip_from ${ip};`),
    '    # IPv6',
    ...CLOUDFLARE_IPV6.map(ip => `    set_real_ip_from ${ip};`),
    '    real_ip_header CF-Connecting-IP;',
    '    real_ip_recursive on;',
    '',
  ];
  const cfConfig = cfLines.join('\n');

  // http { ke baad add karo
  if (content.includes('http {')) {
    content = content.replace(/(http\s*\{)/, `$1\n${cfConfig}`);
  } else if (content.includes('http{')) {
    content = content.replace(/(http\{)/, `$1\n${cfConfig}`);
  } else {
    logError('http { block nahi mila nginx.conf me!');
    process.exit(1);
  }

  fs.writeFileSync(CONFIG.nginxMainConf, content);
  logSuccess('Cloudflare Real IP (IPv4 + IPv6) added to nginx.conf');
}

// =============================================
// Step 5: Site config me include directive add karo
// =============================================
function setupSiteConf() {
  logStep(4, `Setting up site config: ${CONFIG.nginxSiteConf}...`);

  if (!fs.existsSync(CONFIG.nginxSiteConf)) {
    logError(`${CONFIG.nginxSiteConf} not found!`);
    logInfo('Agar alag path hai to CONFIG.nginxSiteConf update karo script me.');
    process.exit(1);
  }

  // Backup
  const backupPath = `${CONFIG.nginxSiteConf}.backup.${Date.now()}`;
  fs.copyFileSync(CONFIG.nginxSiteConf, backupPath);
  logSuccess(`Backup: ${backupPath}`);

  let content = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');

  const blockedIpsFile = path.join(CONFIG.projectPath, 'errorLog', 'nginx-blocked-ips.conf');
  const includeDirective = `include ${blockedIpsFile};`;

  // Remove old include first (avoid duplicates on re-run)
  content = content.replace(new RegExp(`\\s*include\\s+${blockedIpsFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;\\s*\\n?`, 'g'), '\n');

  // Add fresh include
  const serverNameLine = `server_name ${CONFIG.apiServerName};`;
  if (content.includes(serverNameLine)) {
    content = content.replace(
      serverNameLine,
      `${serverNameLine}\n        ${includeDirective}`
    );
    logSuccess(`Include directive added (fresh)`);
  } else {
    logError(`"${serverNameLine}" not found in ${CONFIG.nginxSiteConf}`);
    logError('Manually add karo: ' + includeDirective);
  }

  // Site config se Cloudflare set_real_ip_from hatao (ab nginx.conf me hai)
  const beforeLength = content.length;
  content = content.replace(/^\s*set_real_ip_from\s+.*;\s*\n/gm, '');
  content = content.replace(/^\s*real_ip_header\s+.*;\s*\n/gm, '');
  content = content.replace(/^\s*real_ip_recursive\s+.*;\s*\n/gm, '');
  content = content.replace(/^\s*# Cloudflare Real IP.*\n/gm, '');

  if (content.length < beforeLength) {
    logSuccess('Removed duplicate Cloudflare config from site config');
  }

  fs.writeFileSync(CONFIG.nginxSiteConf, content);
  logSuccess('Site config updated');
}

// =============================================
// Step 6: errorLog folder aur blocked IPs file create karo
// =============================================
function setupErrorLogDir() {
  logStep(5, 'Setting up errorLog directory and files...');

  const errorLogDir = path.join(CONFIG.projectPath, 'errorLog');
  const blockedIpsConf = path.join(errorLogDir, 'nginx-blocked-ips.conf');
  const blockedIpsJson = path.join(errorLogDir, 'blocked-ips.json');
  const blockedIpsHistory = path.join(errorLogDir, 'blocked-ips-history.json');
  const blockedIpsList = path.join(errorLogDir, 'blocked-ips-list.txt');

  // Create directory
  if (!fs.existsSync(errorLogDir)) {
    fs.mkdirSync(errorLogDir, { recursive: true });
    logSuccess(`Created: ${errorLogDir}`);
  } else {
    logSuccess(`Exists: ${errorLogDir}`);
  }

  // Create files if not exist
  const filesToCreate = [
    { path: blockedIpsConf, content: '# Auto-managed by DDoS protection - do not edit manually\n', name: 'nginx-blocked-ips.conf' },
    { path: blockedIpsJson, content: '[]', name: 'blocked-ips.json' },
    { path: blockedIpsHistory, content: '[]', name: 'blocked-ips-history.json' },
    { path: blockedIpsList, content: '', name: 'blocked-ips-list.txt' },
  ];

  filesToCreate.forEach(file => {
    if (!fs.existsSync(file.path)) {
      fs.writeFileSync(file.path, file.content);
      logSuccess(`Created: ${file.name}`);
    } else {
      logSuccess(`Exists: ${file.name}`);
    }
  });

  // Fix semicolons in nginx-blocked-ips.conf
  if (fs.existsSync(blockedIpsConf)) {
    const content = fs.readFileSync(blockedIpsConf, 'utf-8');
    const denyCount = (content.match(/deny /g) || []).length;
    if (denyCount > 0) {
      logSuccess(`Currently ${denyCount} IPs blocked`);
    }

    // Fix missing semicolons
    const fixed = content.replace(/^(deny\s+[\d.:a-fA-F]+)\s*$/gm, '$1;');
    if (fixed !== content) {
      fs.writeFileSync(blockedIpsConf, fixed);
      logWarning('Fixed missing semicolons in deny directives');
    }
  }

  // Set permissions (works on all Linux)
  runCommand(`chmod 755 ${errorLogDir}`);
  runCommand(`chmod 644 ${blockedIpsConf}`);

  // Set nginx user ownership
  const nginxUser = getNginxUser();
  if (nginxUser) {
    runCommand(`chown -R ${nginxUser}:${nginxUser} ${errorLogDir}`);
    logSuccess(`Ownership set to ${nginxUser}`);
  }
  logSuccess('Permissions set');
}

function getNginxUser() {
  // Read nginx.conf to find the user
  try {
    const conf = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');
    const match = conf.match(/^\s*user\s+(\S+)/m);
    if (match) return match[1].replace(';', '');
  } catch (e) {
    // ignore
  }

  // Fallback by OS
  switch (OS_INFO.family) {
    case 'debian': return 'www-data';
    case 'rhel': return 'nginx';
    case 'alpine': return 'nginx';
    default: return 'www-data';
  }
}

// =============================================
// Step 7: .env me DDOS_NGINX_BLOCK_FILE add karo
// =============================================
function setupEnvFile() {
  logStep(6, 'Setting up .env file...');

  const envPath = path.join(CONFIG.projectPath, '.env');
  const blockedIpsConf = path.join(CONFIG.projectPath, 'errorLog', 'nginx-blocked-ips.conf');

  if (!fs.existsSync(envPath)) {
    logWarning(`.env not found at ${envPath} — skipping`);
    return;
  }

  let content = fs.readFileSync(envPath, 'utf-8');

  // Remove all existing DDOS_NGINX_BLOCK_FILE entries (duplicates fix)
  const lines = content.split('\n');
  const filteredLines = lines.filter(line => !line.startsWith('DDOS_NGINX_BLOCK_FILE'));

  // Remove trailing empty "# DDoS Protection" headers if orphaned
  while (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].trim() === '# DDoS Protection') {
    filteredLines.pop();
  }

  // Add single entry
  filteredLines.push('');
  filteredLines.push('# DDoS Protection');
  filteredLines.push(`DDOS_NGINX_BLOCK_FILE=${blockedIpsConf}`);

  content = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(envPath, content);
  logSuccess(`DDOS_NGINX_BLOCK_FILE=${blockedIpsConf}`);
}

// =============================================
// Step 8: Nginx test aur reload
// =============================================
function reloadNginx() {
  logStep(7, 'Testing and reloading nginx...');

  const testResult = runCommand('nginx -t 2>&1');
  if (!testResult || testResult.includes('failed') || testResult.includes('emerg')) {
    logError('Nginx config test FAILED!');
    logError(testResult || 'No output');
    logError('Fix the errors and run script again');
    process.exit(1);
  }
  logSuccess('Nginx config test passed');

  // Try reload first, then restart
  let reloaded = false;

  const reloadResult = runCommand('nginx -s reload 2>&1');
  if (reloadResult === null || reloadResult === '') {
    logSuccess('Nginx reloaded (nginx -s reload)');
    reloaded = true;
  } else if (reloadResult.includes('error') || reloadResult.includes('emerg')) {
    logWarning('nginx -s reload failed, trying systemctl...');
  } else {
    logSuccess('Nginx reloaded');
    reloaded = true;
  }

  if (!reloaded) {
    const restartResult = runCommand('systemctl restart nginx 2>&1');
    if (restartResult === null || restartResult === '') {
      logSuccess('Nginx restarted (systemctl restart nginx)');
    } else {
      // Last resort
      runCommand('service nginx restart 2>&1');
      logWarning('Tried service nginx restart');
    }
  }
}

// =============================================
// Step 9: Setup Firewall (Optional)
// =============================================
function setupFirewall() {
  logStep(8, 'Checking firewall...');

  // Check UFW (Ubuntu/Debian)
  const ufwStatus = runCommand('ufw status 2>&1');
  if (ufwStatus && !ufwStatus.includes('not found') && !ufwStatus.includes('inactive')) {
    logSuccess('UFW firewall detected');
    runCommand('ufw allow "Nginx Full" 2>&1');
    runCommand('ufw allow 80/tcp 2>&1');
    runCommand('ufw allow 443/tcp 2>&1');
    logSuccess('UFW: Nginx ports (80, 443) allowed');
    return;
  }

  // Check firewalld (CentOS/RHEL)
  const firewalldStatus = runCommand('systemctl is-active firewalld 2>&1');
  if (firewalldStatus === 'active') {
    logSuccess('firewalld detected');
    runCommand('firewall-cmd --permanent --add-service=http 2>&1');
    runCommand('firewall-cmd --permanent --add-service=https 2>&1');
    runCommand('firewall-cmd --reload 2>&1');
    logSuccess('firewalld: HTTP/HTTPS allowed');
    return;
  }

  // Check iptables
  const iptables = runCommand('which iptables 2>&1');
  if (iptables && !iptables.includes('not found')) {
    logSuccess('iptables detected (no changes made — manual setup recommended)');
    return;
  }

  logWarning('No firewall detected — skipping');
}

// =============================================
// Step 10: Verify everything
// =============================================
function verifySetup() {
  logStep(9, 'Verifying complete setup...');

  let allGood = true;

  // 1. nginx.conf Cloudflare config
  const mainConf = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');
  if (mainConf.includes('CF-Connecting-IP')) {
    logSuccess('nginx.conf: Cloudflare Real IP configured');
  } else {
    logError('nginx.conf: Cloudflare Real IP NOT found');
    allGood = false;
  }

  // 2. Site config include
  const siteConf = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');
  if (siteConf.includes('nginx-blocked-ips.conf')) {
    logSuccess('Site config: Include directive found');
  } else {
    logError('Site config: Include directive NOT found');
    allGood = false;
  }

  // 3. Blocked IPs file
  const blockedIpsConf = path.join(CONFIG.projectPath, 'errorLog', 'nginx-blocked-ips.conf');
  if (fs.existsSync(blockedIpsConf)) {
    logSuccess('nginx-blocked-ips.conf: File exists');
  } else {
    logError('nginx-blocked-ips.conf: NOT found');
    allGood = false;
  }

  // 4. .env
  const envPath = path.join(CONFIG.projectPath, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    if (envContent.includes('DDOS_NGINX_BLOCK_FILE')) {
      logSuccess('.env: DDOS_NGINX_BLOCK_FILE configured');
    } else {
      logError('.env: DDOS_NGINX_BLOCK_FILE NOT found');
      allGood = false;
    }
  }

  // 5. Nginx running
  const nginxRunning = runCommand('systemctl is-active nginx 2>&1') ||
                       runCommand('pgrep nginx 2>&1');
  if (nginxRunning === 'active' || (nginxRunning && nginxRunning.match(/\d+/))) {
    logSuccess('Nginx is running');
  } else {
    logWarning(`Nginx status: ${nginxRunning}`);
  }

  // 6. API security rules
  const siteConf2 = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');
  if (siteConf2.includes('request_method !~')) {
    logSuccess('Site config: Method restriction configured');
  } else {
    logWarning('Site config: Method restriction NOT found');
  }
  if (siteConf2.includes('block_options')) {
    logSuccess(`Site config: Origin check configured (${CONFIG.allowedOriginDomains.join(', ')})`);
  } else if (CONFIG.allowedOriginDomains.length > 0) {
    logWarning('Site config: Origin check NOT found');
  }

  // 7. OS info
  logSuccess(`OS: ${OS_INFO.name} (${OS_INFO.family})`);

  return allGood;
}

// =============================================
// Ask domains from user (interactive)
// =============================================
function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askDomains() {
  logStep('?', 'Allowed Origin Domains configuration...');

  if (CONFIG.allowedOriginDomains.length > 0) {
    logSuccess(`Already configured: ${CONFIG.allowedOriginDomains.join(', ')}`);
    return;
  }

  console.log('');
  log('  Tumhare allowed domains dalo (comma separated)', 'yellow');
  log('  Example: 6wickets.pro,tresting.com', 'yellow');
  log('  Saare subdomains auto-allow honge (admin.6wickets.pro, etc.)', 'yellow');
  console.log('');

  const answer = await askQuestion(`${COLORS.cyan}  Enter domains: ${COLORS.reset}`);

  if (!answer) {
    logWarning('Koi domain nahi diya — origin check skip hoga');
    return;
  }

  CONFIG.allowedOriginDomains = answer.split(',').map(d => d.trim()).filter(Boolean);
  logSuccess(`Domains set: ${CONFIG.allowedOriginDomains.join(', ')}`);
}

// =============================================
// Robust server block replacer
// =============================================
function replaceServerBlockSetup(content, serverName, newBlock) {
  const lines = content.split('\n');

  // Find server_name line
  let serverNameLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('server_name ' + serverName)) {
      serverNameLine = i;
      break;
    }
  }
  if (serverNameLine === -1) {
    logError('server_name ' + serverName + ' not found');
    return content;
  }

  // Go backwards to find "server {"
  let blockStart = -1;
  for (let j = serverNameLine; j >= 0; j--) {
    if (lines[j].match(/^\s*server\s*\{/) || (lines[j].match(/^\s*server\s*$/) && lines[j + 1] && lines[j + 1].includes('{'))) {
      blockStart = j;
      break;
    }
  }
  if (blockStart === -1) {
    logError('server { not found');
    return content;
  }

  // Count braces from blockStart to find closing }
  let braceCount = 0;
  let blockEnd = -1;
  for (let i = blockStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount === 0 && i > blockStart) {
      blockEnd = i;
      break;
    }
  }
  if (blockEnd === -1) {
    logError('Closing } not found');
    return content;
  }

  logSuccess('Found server block: lines ' + (blockStart + 1) + '-' + (blockEnd + 1));
  lines.splice(blockStart, blockEnd - blockStart + 1, newBlock);
  logSuccess('Server block replaced');
  return lines.join('\n');
}

// =============================================
// Setup API location block with method + origin restrictions
// =============================================
function setupApiLocation() {
  logStep(10, 'Setting up API method + origin restrictions in nginx...');

  if (!fs.existsSync(CONFIG.nginxSiteConf)) {
    logError(`${CONFIG.nginxSiteConf} not found!`);
    return;
  }

  let content = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');

  // Re-run safe — purani config hogi to replace ho jayegi (server block replace hota hai)

  const blockedIpsFile = path.join(CONFIG.projectPath, 'errorLog', 'nginx-blocked-ips.conf');

  // Build origin regex for nginx
  let originCheck = '';
  if (CONFIG.allowedOriginDomains.length > 0) {
    const domainRegex = CONFIG.allowedOriginDomains
      .map(d => d.replace(/\./g, '\\.'))
      .join('|');

    originCheck = `
        # Block fake OPTIONS — sirf allowed origins se allow
        if ($request_method = OPTIONS) {
            set $block_options "true";
        }
        if ($http_origin ~* "(${domainRegex})$") {
            set $block_options "false";
        }
        if ($block_options = "true") {
            return 444;
        }
`;
  }

  // Build the new API server block
  const newServerBlock = `server {
        listen      80;
        server_name ${CONFIG.apiServerName};
        # API Security - Auto configured by serverSetup.js

        include ${blockedIpsFile};

        # API routes
        location /v1/ {
${originCheck}
            # Sirf GET, POST, PUT, DELETE, OPTIONS allow — baaki block
            if ($request_method !~ ^(GET|POST|PUT|DELETE|OPTIONS)$) {
                return 444;
            }

            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_connect_timeout   1000;
            proxy_send_timeout      1500;
            proxy_read_timeout      2000;
            proxy_cache_bypass $http_upgrade;
        }

        # Health check — GET allow
        location /health {
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Admin endpoints — GET, POST allow
        location /admin/ {
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Baaki sab — connection drop (attacker ko kuch nahi milega)
        location / {
            return 444;
        }
}`;

  // Replace the API server block — robust method
  content = replaceServerBlockSetup(content, CONFIG.apiServerName, newServerBlock);
  fs.writeFileSync(CONFIG.nginxSiteConf, content);

  if (CONFIG.allowedOriginDomains.length > 0) {
    logSuccess(`Origin check: ${CONFIG.allowedOriginDomains.join(', ')} (+ all subdomains)`);
  }
  logSuccess('Methods allowed: GET, POST, PUT, DELETE, OPTIONS');
  logSuccess('TRACE, PATCH, HEAD, CONNECT → 444 connection drop');
  logSuccess('Unknown paths (/) → 444 connection drop');
}

// =============================================
// MAIN
// =============================================
async function main() {
  const startTime = Date.now();

  console.log(`\n${COLORS.bold}${COLORS.cyan}==============================================`);
  console.log('  Server Setup - Nginx + Cloudflare + DDoS');
  console.log('  Supports: Ubuntu, Debian, CentOS, RHEL,');
  console.log('  Amazon Linux, AlmaLinux, Rocky, Fedora');
  console.log(`==============================================${COLORS.reset}\n`);

  log(`Project Path:  ${CONFIG.projectPath}`);
  log(`Nginx Config:  ${CONFIG.nginxSiteConf}`);
  log(`API Domain:    ${CONFIG.apiServerName}`);

  checkRoot();
  detectAndShowOS();
  await askDomains();
  checkNginx();
  setupNginxMainConf();
  setupSiteConf();
  setupErrorLogDir();
  setupEnvFile();
  setupApiLocation();
  reloadNginx();
  setupFirewall();
  const allGood = verifySetup();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (allGood) {
    console.log(`\n${COLORS.bold}${COLORS.green}==============================================`);
    console.log('  Setup Complete! All checks passed.');
    console.log(`  Time: ${elapsed}s`);
    console.log(`==============================================${COLORS.reset}\n`);
  } else {
    console.log(`\n${COLORS.bold}${COLORS.yellow}==============================================`);
    console.log('  Setup Complete with warnings.');
    console.log('  Check errors above.');
    console.log(`  Time: ${elapsed}s`);
    console.log(`==============================================${COLORS.reset}\n`);
  }

  log('Next steps:', 'yellow');
  log('  1. App restart karo:', 'yellow');
  log('     pm2 restart all', 'cyan');
  log('');
  log('  2. 10 second baad verify karo:', 'yellow');
  log('     tail -10 /var/log/nginx/access.log | awk \'{print $1}\'', 'cyan');
  log('');
  log('  3. Real visitor IPs dikhni chahiye (Cloudflare IPs nahi)', 'yellow');
  log('');
  log('  4. Blocked IP test:', 'yellow');
  log('     curl -H "Host: ' + CONFIG.apiServerName + '" -H "CF-Connecting-IP: 1.2.3.4" http://127.0.0.1/ -I', 'cyan');
  log('');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
