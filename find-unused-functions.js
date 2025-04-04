const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

// Configuration
const config = {
	// File extensions to scan
	extensions: [".js", ".jsx", ".vue", ".ts", ".tsx"],
	// Directories to ignore
	ignoreDirs: ["node_modules", ".git", "dist", "build"],
	// Files to ignore
	ignoreFiles: [
		"package.json",
		"package-lock.json",
		"yarn.lock",
		".env",
		".env.*",
		"*.log",
		"*.lock",
	],
	// Common event handler prefixes
	eventHandlerPrefixes: ["on", "handle"],
	// Framework lifecycle methods to ignore
	lifecycleMethods: [
		// Vue.js lifecycle hooks
		"beforeCreate",
		"created",
		"beforeMount",
		"mounted",
		"beforeUpdate",
		"updated",
		"beforeDestroy",
		"destroyed",
		"activated",
		"deactivated",
		"errorCaptured",
		// Express.js common methods
		"get",
		"post",
		"put",
		"delete",
		"use",
		"all",
		// Common utility methods
		"toString",
		"valueOf",
		"toJSON",
	],
};

// Store function definitions and their usage
const functionDefinitions = new Map(); // {functionName: {file, line, isExported, isUsed, isEventHandler}}
const functionCalls = new Set(); // Set of function names that are called
const methodCalls = new Map(); // {objectName: Set of method names}
const templateUsage = new Set(); // Set of function names used in Vue templates

function shouldIgnore(filePath) {
	const relativePath = path.relative(process.cwd(), filePath);
	return (
		config.ignoreDirs.some((dir) => relativePath.includes(dir)) ||
		config.ignoreFiles.some((file) => relativePath.endsWith(file))
	);
}

function isJavaScriptFile(filePath) {
	return config.extensions.some((ext) => filePath.endsWith(ext));
}

function isEventHandler(functionName) {
	return config.eventHandlerPrefixes.some((prefix) =>
		functionName.toLowerCase().startsWith(prefix.toLowerCase()),
	);
}

function isLifecycleMethod(functionName) {
	return config.lifecycleMethods.includes(functionName);
}

function parseVueTemplate(content) {
	const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
	if (!templateMatch) return;

	const template = templateMatch[1];
	// Find all method calls in template
	const methodCalls =
		template.match(
			/@[\w-]+="([^"]+)"|:[\w-]+="([^"]+)"|{{\s*([^}]+)\s*}}/g,
		) || [];

	methodCalls.forEach((call) => {
		// Extract function names from method calls
		const functionNames = call.match(/\w+\s*\(/g) || [];
		functionNames.forEach((name) => {
			const cleanName = name.replace(/\($/, "").trim();
			if (cleanName) {
				templateUsage.add(cleanName);
			}
		});
	});
}

function parseJavaScriptFile(filePath) {
	try {
		const content = fs.readFileSync(filePath, "utf8");

		// If it's a Vue file, parse the template first
		if (filePath.endsWith(".vue")) {
			parseVueTemplate(content);
		}

		// Try different parsing options if the first attempt fails
		let ast;
		try {
			// First attempt with standard options
			ast = parser.parse(content, {
				sourceType: "module",
				plugins: [
					"jsx",
					"typescript",
					"decorators-legacy",
					"classProperties",
					"objectRestSpread",
					"asyncGenerators",
					"dynamicImport",
				],
				allowReturnOutsideFunction: true,
				allowSuperOutsideMethod: true,
				allowUndeclaredExports: true,
				strictMode: false,
			});
		} catch (parseError) {
			try {
				// Second attempt with script mode
				ast = parser.parse(content, {
					sourceType: "script",
					plugins: [
						"jsx",
						"typescript",
						"decorators-legacy",
						"classProperties",
						"objectRestSpread",
						"asyncGenerators",
						"dynamicImport",
					],
					allowReturnOutsideFunction: true,
					allowSuperOutsideMethod: true,
					allowUndeclaredExports: true,
					strictMode: false,
				});
			} catch (scriptError) {
				// Third attempt with loose mode
				ast = parser.parse(content, {
					sourceType: "script",
					plugins: [
						"jsx",
						"typescript",
						"decorators-legacy",
						"classProperties",
						"objectRestSpread",
						"asyncGenerators",
						"dynamicImport",
					],
					allowReturnOutsideFunction: true,
					allowSuperOutsideMethod: true,
					allowUndeclaredExports: true,
					strictMode: false,
					strict: false,
					loose: true,
				});
			}
		}

		// Track function definitions and usage
		traverse(ast, {
			// Regular function declarations
			FunctionDeclaration(path) {
				const name = path.node.id?.name;
				if (name) {
					functionDefinitions.set(name, {
						file: filePath,
						line: path.node.loc?.start.line,
						isExported:
							path.parent.type === "ExportDefaultDeclaration" ||
							path.parent.type === "ExportNamedDeclaration",
						isUsed: false,
						isEventHandler: isEventHandler(name),
					});
				}
			},

			// Function expressions assigned to variables
			VariableDeclarator(path) {
				if (
					t.isFunctionExpression(path.node.init) &&
					t.isIdentifier(path.node.id)
				) {
					const name = path.node.id.name;
					functionDefinitions.set(name, {
						file: filePath,
						line: path.node.loc?.start.line,
						isExported:
							path.parent.parent.type ===
								"ExportDefaultDeclaration" ||
							path.parent.parent.type ===
								"ExportNamedDeclaration",
						isUsed: false,
						isEventHandler: isEventHandler(name),
					});
				}
			},

			// Arrow functions assigned to variables
			VariableDeclarator(path) {
				if (
					t.isArrowFunctionExpression(path.node.init) &&
					t.isIdentifier(path.node.id)
				) {
					const name = path.node.id.name;
					functionDefinitions.set(name, {
						file: filePath,
						line: path.node.loc?.start.line,
						isExported:
							path.parent.parent.type ===
								"ExportDefaultDeclaration" ||
							path.parent.parent.type ===
								"ExportNamedDeclaration",
						isUsed: false,
						isEventHandler: isEventHandler(name),
					});
				}
			},

			// Object method definitions
			ObjectMethod(path) {
				if (t.isIdentifier(path.node.key)) {
					const methodName = path.node.key.name;

					// Check if this is part of a Vue component's methods object
					let parent = path.parentPath;
					while (parent && !t.isObjectExpression(parent.node)) {
						parent = parent.parentPath;
					}

					if (
						parent &&
						parent.parentPath &&
						t.isProperty(parent.parentPath.node) &&
						t.isIdentifier(parent.parentPath.node.key) &&
						parent.parentPath.node.key.name === "methods"
					) {
						// This is a Vue method
						functionDefinitions.set(methodName, {
							file: filePath,
							line: path.node.loc?.start.line,
							isExported: false,
							isUsed: templateUsage.has(methodName), // Check if used in template
							isEventHandler: isEventHandler(methodName),
						});
					}
				}
			},

			// Direct function calls
			CallExpression(path) {
				if (t.isIdentifier(path.node.callee)) {
					functionCalls.add(path.node.callee.name);
				}
				// Handle dynamic function calls
				if (t.isMemberExpression(path.node.callee)) {
					if (t.isIdentifier(path.node.callee.property)) {
						functionCalls.add(path.node.callee.property.name);
					}
				}
			},

			// String literals that might contain function names (for event handlers)
			StringLiteral(path) {
				const value = path.node.value;
				if (value.includes("(")) {
					const functionNames = value.match(/\w+\s*\(/g) || [];
					functionNames.forEach((name) => {
						const cleanName = name.replace(/\($/, "").trim();
						if (cleanName) {
							functionCalls.add(cleanName);
						}
					});
				}
			},

			// Export statements
			ExportNamedDeclaration(path) {
				if (path.node.declaration) {
					if (t.isFunctionDeclaration(path.node.declaration)) {
						const name = path.node.declaration.id.name;
						if (functionDefinitions.has(name)) {
							functionDefinitions.get(name).isExported = true;
						}
					}
				}
			},

			ExportDefaultDeclaration(path) {
				if (t.isFunctionDeclaration(path.node.declaration)) {
					const name = path.node.declaration.id?.name;
					if (name && functionDefinitions.has(name)) {
						functionDefinitions.get(name).isExported = true;
					}
				}
			},
		});
	} catch (error) {
		console.error(`Error parsing ${filePath}:`, error.message);
	}
}

function scanDirectory(directoryPath) {
	try {
		const files = fs.readdirSync(directoryPath);

		files.forEach((file) => {
			const fullPath = path.join(directoryPath, file);

			if (shouldIgnore(fullPath)) {
				return;
			}

			try {
				const stat = fs.statSync(fullPath);

				if (stat.isDirectory()) {
					scanDirectory(fullPath);
				} else if (isJavaScriptFile(fullPath)) {
					parseJavaScriptFile(fullPath);
				}
			} catch (statError) {
				console.error(
					`Error accessing ${fullPath}:`,
					statError.message,
				);
			}
		});
	} catch (dirError) {
		console.error(
			`Error reading directory ${directoryPath}:`,
			dirError.message,
		);
	}
}

function findUnusedFunctions() {
	const unusedFunctions = [];

	for (const [name, info] of functionDefinitions) {
		// Skip if function is:
		// 1. Called directly
		// 2. Exported
		// 3. Used in template
		// 4. Is an event handler
		// 5. Is a lifecycle method
		if (
			functionCalls.has(name) ||
			info.isExported ||
			templateUsage.has(name) ||
			info.isEventHandler ||
			isLifecycleMethod(name)
		) {
			continue;
		}

		unusedFunctions.push({
			name,
			file: info.file,
			line: info.line,
		});
	}

	return unusedFunctions;
}

// Main execution
// const directoryPath = process.argv[2] || process.cwd();
const directoryPath =
	"/Users/roneelparalkar/Desktop/projects/triathlon-website";
console.log(`Scanning directory: ${directoryPath}`);
console.log("Searching for unused functions...\n");

scanDirectory(directoryPath);
const unusedFunctions = findUnusedFunctions();

if (unusedFunctions.length === 0) {
	console.log("No unused functions found.");
} else {
	console.log("Found potentially unused functions:");
	console.log("=================================\n");
	console.log(
		"Note: These functions might still be used in ways that couldn't be detected:",
	);
	console.log("- Through dynamic imports");
	console.log("- As callbacks passed to library functions");
	console.log("- Through string-based event bindings");
	console.log("- In build configurations or deployment scripts\n");

	unusedFunctions.forEach((func) => {
		console.log(`Function: ${func.name}`);
		console.log(`File: ${func.file}`);
		console.log(`Line: ${func.line}`);
		console.log("---\n");
	});
}
