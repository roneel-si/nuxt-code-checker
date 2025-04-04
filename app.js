const fs = require("fs");
const path = require("path");

// Keywords to search for (common sensitive information patterns)
const sensitiveKeywords = [
	"api_key",
	"secret",
	"password",
	"token",
	"credential",
	"private_key",
	"public_key",
	"aws_access_key",
	"aws_secret_key",
	"database_password",
	"jwt_secret",
	"oauth",
	"client_secret",
	"access_token",
	"refresh_token",
	"bearer_token",
	"auth_token",
	"encryption_key",
	"decryption_key",
	"master_key",
	"sportsadda",
	"saw01",
	"wethe15",
	"wtf01",
	"royalstag",
	"rstg01",
	"eisl",
	"eisl01",
	"pkl",
	"pkl_v101",
	"fih",
	"fih01",
	"w88",
	"w8801",
	"gt",
	"gt01",
	"kxip",
	"kxip01",
	"bettinggully",
	"bg01",
	"ukk",
	"ukk01",
	"potp",
	"potp01",
	"mansion",
	"test-client",
	"gmr",
	"gmr01",
	"pvl",
	"pvl01",
	"br",
	"br01",
	"mcfc",
	"mcfc01",
	"gfg",
	"gfg01",
	"gg",
	"gg01",
	"rg",
	"rg01",
	"dv",
	"dv01",
	"rr",
	"rr01",
	"lsg",
	"lsg01",
	"pc",
	"pc01",
	"pr",
	"pr01",
	"dsg",
	"dsg01",
	"tri",
	"tri01",
	"wpl",
	"wpl01",
	"kc",
	"kc_v101",
	"upw",
	"upw01",
	"lakr",
	"lakr01",
	"isl",
	"isl_v101",
	"spz",
	"spz01",
	"kkr",
	"kkr_v101",
	"so",
	"so01",
	"dd",
	"dd_v101",
	"wis",
	"wis01",
	"wf",
	"wf01",
	"ecn",
	"ecn_v101",
	"gsoc",
	"gsoc01",
	"ilt20",
	"ilt01",
];

// Patterns to ignore when searching for sensitive keywords
const ignorePatterns = [
	"ddd mmm dd yyyy HH:MM:ss", // Date format pattern
	"yyyy-mm-dd",
	"dd mmmm,yyyy",
	"dd mmm, yyyy",
	"dd mm yy",
	"dd/mm/yyyy",
	"dd mmm yyyy",
	"UTC:yyyy-mm-dd'T'HH:MM:ss'Z'",
	"ddd mmm dd yyyy HH:MM:ss",
	"data-dd-item",
	"yyyy-MM-dd'T'HH:mm:ss'+00:00",
	"dd: m(s)",
	"DD Month YYYY",
	"specific dd,",
	"let dd = [];",
	"if DD apply filter is clicked",
	"let dd = document",
	"YYYY-MM-DD-HH",
	"dd mmmm, yyyy",
	"<br>",
	"</br>",
	"Object.keys(DD)",
	"const DD =",
	"DD[key]",
	"showDD",
	"showSubDD",
	"so that",
	"global.CONFIG.TOKEN",
	"const { username, password }",
	"userData.password === password",
	'TOKEN: "token"',
	'secret: "randomsecret"',
	"DD MMM YYYY HH:mm:SS",
	"mmmm dd, yyyy",
	"If there are nested DD",
	'date as "DD"',
	', "dd")',
	"key)}-dd",
	'format: "dd"',
	"dd mmm",
	"<!-- password tab -->",
	"do so",
	"trade secret",
	'class="btn-text">Password</span',
	'<div class="form-body-wrapper create-password">',
	"password.currentPasswordType == 'password'",
	'autocomplete="current-password"',
	'name="Current Password"',
	'v-model="password.currentPassword"',
	'placeholder="Enter your password"',
	"password toggle",
	"changeInputType('password','currentPasswordType')",
	'<span class="password-sign"></span>',
	'getErrorMessage("Current Password", "changepassword")',
	"new-password",
	"New Password",
	"password.newPasswordType == 'password' ? 'password'",
	'autocomplete="new-password"',
	'name="password"',
	'v-model="password.newPassword"',
	'placeholder="Enter your password"',
	'aria-label="Show/Hide password toggle"',
	"changeInputType('password','newPasswordType')",
	'class="password-sign"',
	'getErrorMessage("password", "changepassword")',
	"ddd, mmm dd, yyyy, hh:mm",
	"this.password",
	"this.token",

	// Add more patterns to ignore here
];

// Files and folders to skip
const skipPatterns = [
	"node_modules",
	".git",
	"dist",
	"build",
	"package.json",
	"package-lock.json",
	"yarn.lock",
	".env",
	".env.*",
	"*.log",
	"*.lock",
	"si-sr.html",
	"favicon.ico",
	"apple-touch-icon.png",
	"favicon-16x16.png",
	"favicon-32x32.png",
];

function shouldSkip(filePath) {
	return skipPatterns.some((pattern) => {
		if (pattern.includes("*")) {
			const regex = new RegExp(pattern.replace("*", ".*"));
			return regex.test(filePath);
		}
		return filePath.includes(pattern);
	});
}

function searchInFile(filePath) {
	try {
		console.log(filePath, "--filePath");
		const content = fs.readFileSync(filePath, "utf8");
		const findings = [];
		const lines = content.split("\n");

		sensitiveKeywords.forEach((keyword) => {
			const regex = new RegExp(
				`(\\b${keyword}\\b|['"]${keyword}['"]|==\\s*['"]${keyword}['"])`,
				"gi",
			);

			// Search through each line
			lines.forEach((line, index) => {
				if (regex.test(line)) {
					// Check if the line matches any ignore patterns
					const shouldIgnore = ignorePatterns.some((pattern) =>
						line.includes(pattern),
					);

					if (!shouldIgnore) {
						findings.push({
							keyword: keyword,
							lineNumber: index + 1,
							line: line.trim(),
						});
					}
				}
			});
		});

		if (findings.length > 0) {
			return {
				file: filePath,
				findings: findings,
			};
		}
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error.message);
	}
	return null;
}

function scanDirectory(directoryPath) {
	const results = [];

	function scan(currentPath) {
		const files = fs.readdirSync(currentPath);

		files.forEach((file) => {
			const fullPath = path.join(currentPath, file);
			const relativePath = path.relative(directoryPath, fullPath);

			if (shouldSkip(relativePath)) {
				return;
			}

			const stat = fs.statSync(fullPath);

			if (stat.isDirectory()) {
				scan(fullPath);
			} else {
				const result = searchInFile(fullPath);
				if (result) {
					results.push(result);
				}
			}
		});
	}

	try {
		scan(directoryPath);
		return results;
	} catch (error) {
		console.error("Error scanning directory:", error.message);
		return [];
	}
}

// Get directory path from command line argument
// const directoryPath = process.argv[2];
const directoryPath = "/Users/roneelparalkar/Desktop/projects/wm-si-wafjs3.0";
if (!directoryPath) {
	console.error("Please provide a directory path as an argument");
	console.error("Usage: node app.js <directory-path>");
	process.exit(1);
}

if (
	!fs.existsSync(directoryPath) ||
	!fs.statSync(directoryPath).isDirectory()
) {
	console.error("Please provide a valid directory path");
	process.exit(1);
}

console.log(`Scanning directory: ${directoryPath}`);
console.log("Searching for sensitive information...\n");

const results = scanDirectory(directoryPath);

if (results.length === 0) {
	console.log("No sensitive information found in the scanned files.");
} else {
	console.log("Found sensitive information in the following files:");
	console.log("==================================================\n");

	results.forEach((result) => {
		console.log(`File: ${result.file}`);
		console.log("Findings:");
		result.findings.forEach((finding) => {
			console.log(`  - Keyword: ${finding.keyword}`);
			console.log(`    Line: ${finding.lineNumber}`);
			console.log(`    Content: ${finding.line}`);
		});
		console.log("\n");
	});
}
