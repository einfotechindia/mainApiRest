const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b\s+(INTO|FROM|TABLE|DATABASE|INDEX|VIEW|SCHEMA))/i,
  /(\b(UNION)\b\s+(ALL\s+)?\bSELECT\b)/i,
  /(\b(EXEC|EXECUTE)\b\s*(MASTER|XP_|SP_|DBO\.))/i,
  /(\bXP_(DIRTREE|CMDSHELL|FILELIST|FILEEXIST|SUBDIRS|REGREAD|REGWRITE|SERVICECONTROL|AVAILABLEMEDIA|ENUMGROUPS|LOGINCONFIG|MAKECAB|NTSEC|SENDMAIL))/i,
  /(\bDECLARE\s+@)/i,
  /(\bSET\s+@\w+\s*=)/i,
  /(\bCAST\s*\(.*\bAS\b)/i,
  /(\bCONVERT\s*\()/i,
  /(\bWAITFOR\s+(DELAY|TIME))/i,
  /(\bBENCHMARK\s*\()/i,
  /(\bSLEEP\s*\()/i,
  /(\bLOAD_FILE\s*\()/i,
  /(\bINTO\s+(OUT|DUMP)FILE)/i,
  /(\bINFORMATION_SCHEMA)/i,
  /(\bSYSOBJECTS|SYSCOLUMNS|SYSDATABASES)/i,
  /(\bMASTER\.\.)/i,
  /(\bHAVING\s+\d+\s*=)/i,
  /(\bORDER\s+BY\s+\d+)/i,
  /(\bGROUP\s+BY\s+\d+)/i,
  /(--|#|\/\*)\s*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|DECLARE)/i,
  /('\s*(OR|AND)\s+'?\d+'?\s*=\s*'?\d+'?\s*)/i,
  /('\s*(OR|AND)\s+'\w+'\s*=\s*'\w+')/i,
  /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|DECLARE|TRUNCATE))/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,
  /(\b1\s*=\s*1\b)/i,
  /(\b1'\s*=\s*'1)/i,
  /(CHAR\s*\(\s*\d+\s*(,\s*\d+\s*)*\))/i,
  /(\bCONCAT\s*\()/i,
  /(\bSUBSTRING\s*\()/i,
  /(\bASCII\s*\()/i,
  /(\bHEX\s*\(.*\))/i,
  /(\bUNHEX\s*\()/i,
  /(0x[0-9a-fA-F]{8,})/i,
  /(\bOPENROWSET\b)/i,
  /(\bOPENDATASOURCE\b)/i,
  /(\bDBLINK\b)/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /(<\s*script[\s>])/i,
  /(<\s*\/\s*script\s*>)/i,
  /(javascript\s*:)/i,
  /(vbscript\s*:)/i,
  /(\bon\w+\s*=)/i,  // onerror=, onload=, onclick=, etc.
  /(<\s*iframe[\s>])/i,
  /(<\s*object[\s>])/i,
  /(<\s*embed[\s>])/i,
  /(<\s*applet[\s>])/i,
  /(<\s*form[\s>])/i,
  /(<\s*meta[\s>])/i,
  /(<\s*svg[\s>\/])/i,
  /(<\s*img\s+[^>]*\bon\w+)/i,
  /(<\s*body\s+[^>]*\bon\w+)/i,
  /(<\s*link[\s>])/i,
  /(<\s*base[\s>])/i,
  /(expression\s*\()/i,
  /(url\s*\(\s*['"]?\s*javascript)/i,
  /(\beval\s*\()/i,
  /(\balert\s*\()/i,
  /(\bprompt\s*\()/i,
  /(\bconfirm\s*\()/i,
  /(\bdocument\s*\.\s*(cookie|write|location|domain))/i,
  /(\bwindow\s*\.\s*(location|open|eval))/i,
  /(String\s*\.\s*fromCharCode)/i,
  /(\batob\s*\()/i,
  /(data\s*:\s*text\/html)/i,
];

// Command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /(;\s*(ls|cat|rm|wget|curl|bash|sh|nc|netcat|python|perl|ruby|php|powershell|cmd)\b)/i,
  /(\|\s*(ls|cat|rm|wget|curl|bash|sh|nc|netcat|python|perl|ruby|php)\b)/i,
  /(`[^`]*`)/,  // backtick execution
  /(\$\(\s*(ls|cat|rm|wget|curl|bash|sh|nc|netcat)\b)/i,
  /(\b(wget|curl)\s+(https?:\/\/|ftp:\/\/))/i,
  /(\b\/etc\/(passwd|shadow|hosts|issue))/i,
  /(\b(nc|netcat)\s+-[a-z]*\s+\d+)/i,
  /(\brm\s+-rf\b)/i,
  /(\b(chmod|chown)\s+[0-7]{3,4}\b)/i,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /(\.\.\/){2,}/,               // ../../
  /(\.\.\\){2,}/,               // ..\..\
  /(%2e%2e(%2f|%5c)){2,}/i,     // URL encoded
  /(%252e%252e%252f){2,}/i,     // double encoded
  /(\.\.%c0%af)/i,              // UTF-8 encoded
  /(\.\.%c1%9c)/i,              // UTF-8 encoded
];

// LDAP injection patterns
const LDAP_INJECTION_PATTERNS = [
  /(\)\s*\(\s*\|)/,
  /(\)\s*\(\s*&)/,
  /(\*\s*\)\s*\()/,
];

// NoSQL injection patterns (beyond what express-mongo-sanitize catches)
const NOSQL_INJECTION_PATTERNS = [
  /(\{\s*['"]\s*\$\s*(gt|gte|lt|lte|ne|eq|in|nin|regex|where|exists|type|mod|all|size|elemMatch|not|nor|or|and)\s*['"]\s*:)/i,
  /(\bfunction\s*\(\s*\)\s*\{)/,
  /(this\s*\.\s*constructor)/,
  /(__proto__)/,
  /(prototype\s*\[)/,
];

// Combine all patterns for efficient checking
const ALL_PATTERNS = [
  { patterns: SQL_INJECTION_PATTERNS, type: 'SQL Injection' },
  { patterns: XSS_PATTERNS, type: 'XSS Attack' },
  { patterns: COMMAND_INJECTION_PATTERNS, type: 'Command Injection' },
  { patterns: PATH_TRAVERSAL_PATTERNS, type: 'Path Traversal' },
  { patterns: LDAP_INJECTION_PATTERNS, type: 'LDAP Injection' },
  { patterns: NOSQL_INJECTION_PATTERNS, type: 'NoSQL Injection' },
];

function detectMaliciousPayload(obj, path = '') {
  if (!obj) return null;

  if (typeof obj === 'string') {
    // Decode common encodings before checking
    let decoded = obj;
    try {
      decoded = decodeURIComponent(obj);
    } catch (e) {
      // If decoding fails, use original string
    }

    for (const group of ALL_PATTERNS) {
      for (const pattern of group.patterns) {
        if (pattern.test(obj) || pattern.test(decoded)) {
          return {
            type: group.type,
            location: path || 'value',
          };
        }
      }
    }
    return null;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = detectMaliciousPayload(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      // Check the key itself for injection
      const keyResult = detectMaliciousPayload(key, `${path}.key(${key})`);
      if (keyResult) return keyResult;

      // Check the value
      const valResult = detectMaliciousPayload(obj[key], `${path}.${key}`);
      if (valResult) return valResult;
    }
  }

  return null;
}

function checkUrlForAttacks(url) {
  if (!url) return null;

  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch (e) {
    // use original
  }

  for (const group of ALL_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(url) || pattern.test(decoded)) {
        return { type: group.type, location: 'URL' };
      }
    }
  }
  return null;
}

const securityGuard = (req, res, next) => {
  try {
    // 1. Check URL path + query string
    const urlCheck = checkUrlForAttacks(req.originalUrl);
    if (urlCheck) {
      console.warn(`[SECURITY BLOCKED] ${urlCheck.type} detected in ${urlCheck.location} | IP: ${req.ip} | URL: ${req.originalUrl}`);
      return res.status(403).json({
        status: 403,
        code: 1,
        message: 'Request blocked: Forbidden request detected.',
      });
    }

    // 2. Check request body
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyCheck = detectMaliciousPayload(req.body, 'body');
      if (bodyCheck) {
        console.warn(`[SECURITY BLOCKED] ${bodyCheck.type} detected in ${bodyCheck.location} | IP: ${req.ip} | URL: ${req.originalUrl}`);
        return res.status(403).json({
          status: 403,
          code: 1,
          message: 'Request blocked: Forbidden request detected.',
        });
      }
    }

    // 3. Check query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      const queryCheck = detectMaliciousPayload(req.query, 'query');
      if (queryCheck) {
        console.warn(`[SECURITY BLOCKED] ${queryCheck.type} detected in ${queryCheck.location} | IP: ${req.ip} | URL: ${req.originalUrl}`);
        return res.status(403).json({
          status: 403,
          code: 1,
          message: 'Request blocked: Forbidden request detected.',
        });
      }
    }

    // 4. Check route params
    if (req.params && Object.keys(req.params).length > 0) {
      const paramsCheck = detectMaliciousPayload(req.params, 'params');
      if (paramsCheck) {
        console.warn(`[SECURITY BLOCKED] ${paramsCheck.type} detected in ${paramsCheck.location} | IP: ${req.ip} | URL: ${req.originalUrl}`);
        return res.status(403).json({
          status: 403,
          code: 1,
          message: 'Request blocked: Forbidden request detected.',
        });
      }
    }

    // 5. Check headers for common injection vectors
    const suspiciousHeaders = ['referer', 'user-agent', 'x-forwarded-for', 'x-forwarded-host', 'cookie'];
    for (const header of suspiciousHeaders) {
      const headerVal = req.headers[header];
      if (headerVal) {
        const headerCheck = detectMaliciousPayload(headerVal, `header.${header}`);
        if (headerCheck) {
          console.warn(`[SECURITY BLOCKED] ${headerCheck.type} detected in header.${header} | IP: ${req.ip} | URL: ${req.originalUrl}`);
          return res.status(403).json({
            status: 403,
            code: 1,
            message: 'Request blocked: Forbidden request detected.',
          });
        }
      }
    }

    next();
  } catch (err) {
    console.error('[SECURITY GUARD ERROR]', err.message);
    // On error in security check, block the request to be safe
    return res.status(403).json({
      status: 403,
      code: 1,
      message: 'Request blocked: Forbidden request detected.',
    });
  }
};

module.exports = securityGuard;
