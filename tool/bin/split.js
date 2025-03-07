(function() {

// From: https://github.com/sokra/source-map-visualization

// PATCH: app.less
var CSS = `
* {
	font-family: Monaco,Menlo,Consolas,Courier New,monospace;
	font-size: 12px;
}
span.original-item {
	border-left: 1px solid black;
	margin: 1px;
	min-width: 3px;
}
span.generated-item {
	margin: 1px;
}
span.selected {
	background: black;
	color: white;
}
.style-0 {
	background: #FFFF66;
}
.style-1 {
	background: #FFFFFF;
}
.style-2 {
	background: #FFBBBB;
}
.style-3 {
	background: #AAFFFF;
}
.style-4 {
	background: #FFAAFF;
}

pre {
	overflow-x: auto;
}

pre code {
	white-space: pre-wrap;
	word-break: normal;
	word-wrap: normal;
}

table {
	width: 100%;
}

tr, td {
	vertical-align: top;
	margin: 0;
	width: 33%;
}`;

// PATCH: app.js, after HTML generation
var SCRIPT = `
	$("body").delegate(".original-item, .generated-item, .mapping-item", "mouseenter", function() {
		$(".selected").removeClass("selected");
		var mappedItems = $(this).data('mapped');
		if (!mappedItems){
			var source = $(this).data("source");
			var line = $(this).data("line");
			var column = $(this).data("column");
			mappedItems = $(".item-" + source + "-" + line + "-" + column);
			var twinItem = mappedItems.not('.mapping-item').not(this);
			$(this).data('mapped', mappedItems)
			$(this).data('twin', twinItem)
		}
		$(mappedItems).addClass("selected");
	}).delegate(".original-item, .generated-item, .mapping-item", "click", function() {
		var twinItem = $(this).data('twin');
		var elem = $(twinItem).get(0)
		if (elem && elem.scrollIntoViewIfNeeded)
			elem.scrollIntoViewIfNeeded();
	});
`;


// Original: generateHtml.js
var SourceMap = require("source-map");
var LINESTYLES = 5;
var MAX_LINES = 5000;

function formatSource(source) {
	return source.replace(/</g, "&lt;").split('/').pop();
}

global.generateHtml = function(map, generatedCode, sources) {
	var generatedSide = [];
	var originalSide = [];
	var mappingsSide = [];

	function addTo(side, line, html) {
		side[line] = (side[line] || "") + html;
	}

	function span(text, options) {
		var attrs = {};
		if(options) {
			if(options.generated) {
				attrs["class"] = "generated-item";
			} else if(options.mapping) {
				attrs["class"] = "mapping-item";
			} else {
				attrs["class"] = "original-item";
			}
			if(typeof options.source !== "undefined") {
				attrs["class"] += " item-" + options.source + "-" + options.line + "-" + options.column;
			}
			attrs["class"] += " style-" + (options.line%LINESTYLES);
			if (options.name) attrs["title"] = options.name;
			attrs["data-source"] = options.source;
			attrs["data-line"] = options.line;
			attrs["data-column"] = options.column;
		}
		return "<span " + Object.keys(attrs).filter(function(key) {
			return typeof attrs[key] !== "undefined";
		}).map(function(key) {
			return key + "=\"" + attrs[key] + "\"";
		}).join(" ") + ">" + (text + "").replace(/</g, "&lt;") + "</span>";
	}

	var mapSources = map.sources;

	var generatedLine = 1;
	var nodes = SourceMap.SourceNode.fromStringWithSourceMap(generatedCode, map).children;
	nodes.forEach(function(item, idx) {
		if(generatedLine > MAX_LINES) return;
		if(typeof item === "string") {
			item.split("\n").forEach(function(line) {
				addTo(generatedSide, generatedLine, line);
				generatedLine++;
			});
			generatedLine--;
		} else {
			var str = item.toString();
			var source = mapSources.indexOf(item.source);
			str.split("\n").forEach(function(line) {
				addTo(generatedSide, generatedLine, span(line, {
					generated: true,
					source: source,
					line: item.line,
					column: item.column,
					name: item.name
				}));
				generatedLine++
			});
			generatedLine--;
		}
	});


	var lastGenLine = 1;
	var lastOrgSource = "";
	var mappingsLine = 1;
	map.eachMapping(function(mapping) {
		if(mapping.generatedLine > MAX_LINES) return;
		while(lastGenLine < mapping.generatedLine) {
			mappingsLine++;
			lastGenLine++;
			addTo(mappingsSide, mappingsLine, lastGenLine + ": ");
		}
		if(typeof mapping.originalLine == "number") {
			if(lastOrgSource !== mapping.source && mapSources.length > 1) {
				addTo(mappingsSide, mappingsLine, "<b>[" + formatSource(mapping.source) + "]</b> ");
				lastOrgSource = mapping.source;
			}
			var source = mapSources.indexOf(mapping.source);
			addTo(mappingsSide, mappingsLine, span(mapping.generatedColumn + "->" + mapping.originalLine + ":" + mapping.originalColumn, {
				mapping: true,
				source: source,
				line: mapping.originalLine,
				column: mapping.originalColumn
			}));
		} else {
			addTo(mappingsSide, mappingsLine, span(mapping.generatedColumn, {
				mapping: true
			}));
		}
		addTo(mappingsSide, mappingsLine, "  ");
	});


	var originalLine = 1;
	var line = 1, column = 0, currentOutputLine = 1, targetOutputLine = -1, limited = false;
	var lastMapping = null;
	var currentSource = null;
	var exampleLines;
	var mappingsBySource = {};
	map.eachMapping(function(mapping) {
		if(typeof mapping.originalLine !== "number") return;
		if(mapping.generatedLine > MAX_LINES) return limited = true;
		if(!mappingsBySource[mapping.source]) mappingsBySource[mapping.source] = [];
		mappingsBySource[mapping.source].push(mapping);
	}, undefined, SourceMap.SourceMapConsumer.ORIGINAL_ORDER);
	Object.keys(mappingsBySource).map(function(source) {
		return [source, mappingsBySource[source][0].generatedLine];
	}).sort(function(a, b) {
		if(a[0] === "?") return 1;
		if(b[0] === "?") return -1;
		return a[1] - b[1];
	}).forEach(function(arr) {
		var source = arr[0];
		var mappings = mappingsBySource[source];

		if(currentSource) endFile();
		lastMapping = null;
		line = 1;
		column = 0;
		targetOutputLine = -1;
		if(mapSources.length > 1) {
			currentOutputLine++;
		}
		var startLine = mappings.map(function(mapping) {
			return mapping.generatedLine - mapping.originalLine + 1;
		}).sort(function(a, b) { return a - b });
		startLine = startLine[0];
		while(currentOutputLine < startLine) {
			originalLine++;
			currentOutputLine++;
		}
		if(mapSources.length > 1) {
			addTo(originalSide, originalLine, "<h4>[" + formatSource(source) + "]</h4>");
			originalLine++;
		}
		var exampleSource = sources[mapSources.indexOf(source)];
		if(!exampleSource) throw new Error("Source '" + source + "' missing");
		exampleLines = exampleSource.split("\n");
		currentSource = source;
		mappings.forEach(function(mapping, idx) {
			if(lastMapping) {
				var source = mapSources.indexOf(lastMapping.source);
				if(line < mapping.originalLine) {
					addTo(originalSide, originalLine, span(exampleLines.shift(), {
						original: true,
						source: source,
						line: lastMapping.originalLine,
						column: lastMapping.originalColumn
					}));
					originalLine++;
					line++; column = 0;
					currentOutputLine++;
					while(line < mapping.originalLine) {
						addTo(originalSide, originalLine, exampleLines.shift());
						originalLine++;
						line++; column = 0;
						currentOutputLine++;
					}
					startLine = [];
					for(var i = idx; i < mappings.length && mappings[i].originalLine <= mapping.originalLine + 1; i++) {
						startLine.push(mappings[i].generatedLine - mappings[i].originalLine + mapping.originalLine);
					}
					startLine.sort(function(a, b) { return a - b });
					startLine = startLine[0];
					while(typeof startLine !== "undefined" && currentOutputLine < startLine) {
						addTo(originalSide, originalLine, "~");
						originalLine++;
						currentOutputLine++;
					}
					if(column < mapping.originalColumn) {
						addTo(originalSide, originalLine, shiftColumns(mapping.originalColumn - column));
					}
				}
				if(mapping.originalColumn > column) {
					addTo(originalSide, originalLine, span(shiftColumns(mapping.originalColumn - column), {
						original: true,
						source: source,
						line: lastMapping.originalLine,
						column: lastMapping.originalColumn
					}));
				}
			} else {
				while(line < mapping.originalLine) {
					addTo(originalSide, originalLine, exampleLines.shift());
					originalLine++;
					line++; column = 0;
				}
				if(column < mapping.originalColumn) {
					addTo(originalSide, originalLine, shiftColumns(mapping.originalColumn - column));
				}
			}
			lastMapping = mapping;
		});
	});
	function endFile() {
		if(lastMapping) {
			var source = mapSources.indexOf(lastMapping.source);
			addTo(originalSide, originalLine, span(exampleLines.shift(), {
				original: true,
				source: source,
				line: lastMapping.originalLine,
				column: lastMapping.originalColumn
			}));
		}
		if(!limited) {
			exampleLines.forEach(function(line) {
				originalLine++;
				currentOutputLine++;
				addTo(originalSide, originalLine, line);
			});
		}
	}
	endFile();

	function shiftColumns(count) {
		var nextLine = exampleLines[0];
		exampleLines[0] = nextLine.substr(count);
		column += count;
		return nextLine.substr(0, count);
	}

	var length = Math.max(originalSide.length, generatedSide.length, mappingsSide.length);

	var tableRows = [];

	for(var i = 0; i < length; i++) {
		tableRows[i] = [
			originalSide[i] || "",
			generatedSide[i] || "",
			mappingsSide[i] || ""
		].map(function(cell) {
			return "<td>" + cell + "</td>";
		}).join("");
	}

	return "<!DOCTYPE html>\n<html>\n<style>" + CSS + "</style>\n<table><tbody>\n" + tableRows.map(function(row) {
		return "<tr>" + row + "</tr>\n";
	}).join("") + "</tbody></table>\n"
	+ '<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"/></script><script>' + SCRIPT + "</script></html>";


}

})();

;(function ($hx_exports, $global) { "use strict";
var SourceMapConsumer = require("source-map").SourceMapConsumer;
class Bundler {
	constructor(parser,sourceMap,extractor,reporter) {
		this.parser = parser;
		this.sourceMap = sourceMap;
		this.extractor = extractor;
		this.reporter = reporter;
		this.minifyId = new MinifyId();
	}
	generate(src,output,commonjs,debugSourceMap) {
		this.commonjs = commonjs;
		this.debugSourceMap = this.sourceMap != null && debugSourceMap;
		this.bundles = [this.extractor.main].concat(this.extractor.bundles);
		this.revMap = { };
		let len = this.bundles.length;
		let _g = 0;
		let _g1 = len;
		while(_g < _g1) {
			let i = _g++;
			this.createRevMap(i,this.bundles[i]);
		}
		this.buildIndex(src);
		let results = [];
		let _g2 = 0;
		let _g3 = len;
		while(_g2 < _g3) {
			let i = _g2++;
			let bundle = this.bundles[i];
			let isMain = bundle.isMain;
			let bundleOutput = isMain ? output : js_node_Path.join(js_node_Path.dirname(output),bundle.alias + ".js");
			haxe_Log.trace("Emit " + bundleOutput,{ fileName : "tool/src/Bundler.hx", lineNumber : 94, className : "Bundler", methodName : "generate"});
			let buffer = this.emitBundle(src,bundle,isMain);
			results[i] = { name : bundle.name, map : this.writeMap(bundleOutput,buffer), source : this.write(bundleOutput,buffer.src), debugMap : buffer.debugMap};
		}
		return results;
	}
	buildIndex(src) {
		let ids = this.idMap = { };
		if(!this.commonjs) {
			ids["require"] = true;
		}
		let rev = this.revMap;
		let body = this.parser.rootBody;
		let bodyLength = body.length;
		let bundlesLength = this.bundles.length;
		let _g = 1;
		let _g1 = bodyLength;
		while(_g < _g1) {
			let i = _g++;
			let node = body[i];
			if(node.__tag__ == null) {
				node.__main__ = true;
				let _g = 1;
				let _g1 = bundlesLength;
				while(_g < _g1) {
					let j = _g++;
					this.bundles[j].indexes.push(i);
				}
			} else if(node.__tag__ != "__reserved__") {
				ids[node.__tag__] = true;
				let list = rev[node.__tag__];
				if(list == null) {
					list = [0];
				}
				let _g = 0;
				let _g1 = list.length;
				while(_g < _g1) {
					let j = _g++;
					let index = list[j];
					if(index == 0) {
						node.__main__ = true;
					} else {
						this.bundles[index].indexes.push(i);
					}
				}
			} else {
				node.__main__ = true;
			}
		}
	}
	createRevMap(index,bundle) {
		if(bundle.isLib) {
			let _g = 0;
			let _g1 = bundle.libParams;
			while(_g < _g1.length) {
				let param = _g1[_g];
				++_g;
				this.minifyId.set(param);
			}
		} else {
			this.minifyId.set(bundle.name);
		}
		let rev = this.revMap;
		let nodes = bundle.nodes;
		let len = nodes.length;
		let _g = 0;
		let _g1 = len;
		while(_g < _g1) {
			let i = _g++;
			let list = rev[nodes[i]];
			if(list != null) {
				list.push(index);
			} else {
				rev[nodes[i]] = [index];
			}
		}
	}
	writeMap(output,buffer) {
		if(this.sourceMap == null || buffer.map == null) {
			return null;
		}
		return { path : "" + output + ".map", content : this.sourceMap.emitFile(output,buffer.map)};
	}
	write(output,buffer) {
		if(buffer == null) {
			return null;
		}
		return { path : output, content : buffer};
	}
	emitBundle(src,bundle,isMain) {
		let output = this.emitJS(src,bundle,isMain);
		let map = this.sourceMap != null ? this.sourceMap.emitMappings(output.mapNodes,output.mapOffset) : null;
		let debugMap = this.debugSourceMap && map != null ? this.emitDebugMap(output.buffer,bundle,map) : null;
		return { src : output.buffer, map : map, debugMap : debugMap};
	}
	emitDebugMap(src,bundle,rawMap) {
		if(rawMap.sources.length == 0) {
			return null;
		}
		let _this = rawMap.sources;
		let result = new Array(_this.length);
		let _g = 0;
		let _g1 = _this.length;
		while(_g < _g1) {
			let i = _g++;
			let url = _this[i];
			result[i] = url == "" ? null : url;
		}
		rawMap.sources = result;
		let consumer = new SourceMapConsumer(rawMap);
		let _g2 = [];
		let _g3 = 0;
		let _g4 = rawMap.sources;
		while(_g3 < _g4.length) {
			let source = _g4[_g3];
			++_g3;
			if(source == null || source == "") {
				_g2.push("");
			} else {
				let fileName = source.split("file://").pop();
				_g2.push(js_node_Fs.readFileSync(fileName,"utf8"));
			}
		}
		let sourcesContent = _g2;
		try {
			return Bundler.generateHtml(consumer,src,sourcesContent);
		} catch( _g ) {
			let err = haxe_Exception.caught(_g).unwrap();
			haxe_Log.trace("[WARNING] error while generating debug map for " + bundle.name + ": " + Std.string(err),{ fileName : "tool/src/Bundler.hx", lineNumber : 235, className : "Bundler", methodName : "emitDebugMap"});
			return null;
		}
	}
	emitJS(src,bundle,isMain) {
		this.reporter.start(bundle);
		let imports = Reflect.fields(bundle.imports);
		let shared = Reflect.fields(bundle.shared);
		let exports = Reflect.fields(bundle.exports);
		let body = this.parser.rootBody;
		let hasSourceMap = this.sourceMap != null;
		let mapOffset = 0;
		let buffer = "";
		if(isMain) {
			buffer += this.getBeforeBodySrc(src);
			if(hasSourceMap) {
				mapOffset += this.getBeforeBodyOffset();
			}
		} else {
			++mapOffset;
		}
		let inc = bundle.nodes;
		let incAll = isMain && bundle.nodes.length == 0;
		let mapNodes = [];
		let frag = isMain || bundle.isLib ? Bundler.FRAGMENTS.MAIN : Bundler.FRAGMENTS.CHILD;
		if(this.commonjs) {
			buffer += "/* eslint-disable */ \"use strict\"\n";
			++mapOffset;
			buffer += frag.EXPORTS;
			++mapOffset;
			buffer += frag.SHARED;
			++mapOffset;
		} else {
			buffer += "(function ($hx_exports, $global) { \"use-strict\";\n";
			++mapOffset;
			buffer += frag.SHARED;
			++mapOffset;
			if(isMain) {
				buffer += "var require = (function(){ return function require(m) { return $s.__registry__[m]; } })();\n";
				++mapOffset;
			}
		}
		if(imports.length > 0 || shared.length > 0) {
			let _g = [];
			let _g1 = 0;
			while(_g1 < imports.length) {
				let node = imports[_g1];
				++_g1;
				_g.push("" + node + " = $" + "s." + this.minifyId.get(node));
			}
			let tmp = shared.concat(_g);
			buffer += "var " + tmp.join(", ") + ";\n";
			++mapOffset;
		}
		if(isMain) {
			let len = body.length - 1;
			let _g = 1;
			let _g1 = len;
			while(_g < _g1) {
				let i = _g++;
				let node = body[i];
				if(!incAll && !node.__main__) {
					continue;
				}
				if(hasSourceMap) {
					mapNodes.push(node);
				}
				let chunk = HxOverrides.substr(src,node.start,node.end - node.start);
				this.reporter.add(node.__tag__,chunk.length);
				buffer += chunk;
				buffer += "\n";
			}
		} else {
			let indexes = bundle.indexes;
			let len = indexes.length;
			let _g = 0;
			let _g1 = len;
			while(_g < _g1) {
				let i = _g++;
				let node = body[indexes[i]];
				if(hasSourceMap) {
					mapNodes.push(node);
				}
				let chunk = HxOverrides.substr(src,node.start,node.end - node.start);
				this.reporter.add(node.__tag__,chunk.length);
				buffer += chunk;
				buffer += "\n";
			}
		}
		if(this.parser.isHot != null) {
			buffer += this.emitHot(inc);
		}
		if(exports.length > 0) {
			let _g = 0;
			while(_g < exports.length) {
				let node = exports[_g];
				++_g;
				if(node.charAt(0) == "$" || Object.prototype.hasOwnProperty.call(this.idMap,node)) {
					buffer += "$" + "s." + this.minifyId.get(node) + " = " + node + "; ";
				}
			}
			buffer += "\n";
		}
		let _gthis = this;
		if(isMain) {
			let run = body[body.length - 1];
			buffer += HxOverrides.substr(src,run.start,run.end - run.start);
			buffer += "\n";
			let _g = 0;
			let _g1 = this.extractor.bundles;
			while(_g < _g1.length) {
				let bundle = _g1[_g];
				++_g;
				if(!bundle.isLib) {
					continue;
				}
				let match = "\"" + bundle.name + "__BRIDGE__\"";
				let _g2 = [];
				let _g3 = 0;
				let _g4 = Reflect.fields(bundle.exports);
				while(_g3 < _g4.length) {
					let v = _g4[_g3];
					++_g3;
					if(shared.indexOf(v) >= 0) {
						_g2.push(v);
					}
				}
				let _this = _g2;
				let result = new Array(_this.length);
				let _g5 = 0;
				let _g6 = _this.length;
				while(_g5 < _g6) {
					let i = _g5++;
					let node = _this[i];
					result[i] = "" + node + " = $" + "s." + _gthis.minifyId.get(node);
				}
				let bridge = result.join(", ");
				if(bridge == "") {
					bridge = "0";
				}
				buffer = buffer.split(match).join("(" + bridge + ")");
			}
		}
		if(!this.commonjs) {
			buffer += "})(" + "typeof exports != \"undefined\" ? exports : typeof window != \"undefined\" ? window : typeof self != \"undefined\" ? self : this" + ", " + "typeof window != \"undefined\" ? window : typeof global != \"undefined\" ? global : typeof self != \"undefined\" ? self : this" + ");\n";
		}
		return { buffer : buffer, mapNodes : mapNodes, mapOffset : mapOffset};
	}
	getBeforeBodyOffset() {
		return this.parser.rootExpr.loc.start.line;
	}
	getBeforeBodySrc(src) {
		let chunk = HxOverrides.substr(src,0,this.parser.rootExpr.start);
		this.reporter.includedBefore(chunk.length);
		return chunk;
	}
	emitHot(inc) {
		let names = [];
		let _g = 0;
		let _g1 = Reflect.fields(this.parser.isHot);
		while(_g < _g1.length) {
			let name = _g1[_g];
			++_g;
			if(this.parser.isHot[name] && inc.indexOf(name) >= 0) {
				names.push(name);
			}
		}
		if(names.length == 0) {
			return "";
		}
		return "if ($" + "global.__REACT_HOT_LOADER__)\n" + ("  [" + names.join(",") + "].map(function(c) {\n") + "    __REACT_HOT_LOADER__.register(c,c.displayName,c.__fileName__);\n" + "  });\n";
	}
}
Bundler.__name__ = true;
class Extractor {
	constructor(parser) {
		this.parser = parser;
	}
	process(mainModule,modulesList,debugMode) {
		let t0 = new Date().getTime();
		haxe_Log.trace("Bundling...",{ fileName : "tool/src/Extractor.hx", lineNumber : 51, className : "Extractor", methodName : "process"});
		this.moduleMap = { };
		this.parenting = new graphlib_Graph();
		this.moduleTest = { };
		this.moduleAlias = { };
		if(this.parser.typesCount == 0) {
			haxe_Log.trace("Warning: unable to process (no type metadata)",{ fileName : "tool/src/Extractor.hx", lineNumber : 58, className : "Extractor", methodName : "process"});
			this.main = this.createBundle(mainModule);
			this.bundles = [this.main];
			return;
		}
		this.g = this.parser.graph;
		this.hmrMode = debugMode;
		this.mainModule = mainModule;
		this.uniqueModules(modulesList);
		let _g = 0;
		let _g1 = this.modules;
		while(_g < _g1.length) {
			let $module = _g1[_g];
			++_g;
			this.moduleTest[$module] = true;
		}
		this.linkOrphans();
		if(debugMode) {
			this.linkEnums(mainModule,Reflect.fields(this.parser.isEnum));
		}
		let libTest = this.expandLibs();
		let parents = { };
		this.recurseVisit([mainModule],libTest,parents);
		this.recurseVisit(this.modules,libTest,parents);
		this.walkLibs(libTest,parents);
		this.populateBundles(mainModule,parents);
		this.main = this.moduleMap[mainModule];
		let _gthis = this;
		let _this = this.modules;
		let result = new Array(_this.length);
		let _g2 = 0;
		let _g3 = _this.length;
		while(_g2 < _g3) {
			let i = _g2++;
			let $module = _this[i];
			let name = $module.indexOf("=") > 0 ? $module.split("=")[0] : $module;
			result[i] = _gthis.moduleMap[name];
		}
		let _g4 = [];
		let _g5 = 0;
		let _g6 = result;
		while(_g5 < _g6.length) {
			let v = _g6[_g5];
			++_g5;
			if(v != null) {
				_g4.push(v);
			}
		}
		this.bundles = _g4;
		let t1 = new Date().getTime();
		haxe_Log.trace("Graph processed in: " + (t1 - t0) + "ms",{ fileName : "tool/src/Extractor.hx", lineNumber : 95, className : "Extractor", methodName : "process"});
	}
	populateBundles(mainModule,parents) {
		let bundle = this.moduleMap[mainModule];
		this.recursePopulate(bundle,mainModule,parents,{ });
	}
	recursePopulate(bundle,root,parents,visited) {
		bundle.nodes.push(root);
		let $module = bundle.name;
		let succ = this.g.successors(root);
		let parent;
		let _g = 0;
		while(_g < succ.length) {
			let node = succ[_g];
			++_g;
			let parentModule = parents[node];
			if(parentModule == $module) {
				parent = bundle;
			} else {
				parent = this.moduleMap[parentModule];
				if(bundle.isMain) {
					bundle.shared[node] = true;
				} else if(node == parentModule) {
					if(this.parenting.hasEdge($module,parentModule)) {
						bundle.shared[node] = true;
					} else {
						bundle.imports[node] = true;
					}
				} else {
					bundle.imports[node] = true;
				}
				parent.exports[node] = true;
			}
			if(Object.prototype.hasOwnProperty.call(visited,node)) {
				continue;
			}
			visited[node] = true;
			this.recursePopulate(parent,node,parents,visited);
		}
	}
	walkLibs(libTest,parents) {
		let children = [];
		let _g = 0;
		while(_g < libTest.length) {
			let lib = libTest[_g];
			++_g;
			let _g1 = 0;
			let _g2 = Reflect.fields(lib.roots);
			while(_g1 < _g2.length) {
				let node = _g2[_g1];
				++_g1;
				let _g = [];
				let _g3 = 0;
				let _g4 = libTest;
				while(_g3 < _g4.length) {
					let v = _g4[_g3];
					++_g3;
					if(v != lib) {
						_g.push(v);
					}
				}
				let test = _g;
				if(Object.prototype.hasOwnProperty.call(parents,node)) {
					continue;
				}
				parents[node] = lib.bundle.name;
				this.walkGraph(lib.bundle,node,test,parents,children);
			}
		}
	}
	recurseVisit(modules,libTest,parents) {
		let children = [];
		let _g = 0;
		while(_g < modules.length) {
			let $module = modules[_g];
			++_g;
			if($module.indexOf("=") > 0 || Object.prototype.hasOwnProperty.call(this.moduleMap,$module) || !this.g.hasNode($module)) {
				continue;
			}
			let mod = this.createBundle($module);
			parents[$module] = $module;
			this.walkGraph(mod,$module,libTest,parents,children);
		}
		if(children.length > 0) {
			this.recurseVisit(children,libTest,parents);
		}
	}
	walkGraph(bundle,target,libTest,parents,children) {
		let $module = bundle.name;
		let succ = this.g.successors(target);
		let _g = 0;
		while(_g < succ.length) {
			let node = succ[_g];
			++_g;
			if(Object.prototype.hasOwnProperty.call(this.moduleTest,node)) {
				let childModule = node;
				if(!this.parenting.hasEdge(childModule,$module)) {
					this.parenting.setEdge($module,childModule);
					children.push(childModule);
				}
				continue;
			}
			let lib = this.libMap[node];
			let tmp;
			if(lib != null && libTest.indexOf(lib) >= 0) {
				lib.roots[node] = true;
				tmp = true;
			} else {
				tmp = false;
			}
			if(tmp) {
				continue;
			}
			if(Object.prototype.hasOwnProperty.call(parents,node)) {
				let ownerModule = parents[node];
				if(ownerModule == $module) {
					continue;
				}
				let owner = this.moduleMap[ownerModule];
				if(!owner.isMain) {
					let parentModule = this.commonParent(bundle,owner);
					let parent = this.moduleMap[parentModule];
					if(parent != owner) {
						this.shareGraph(parent,owner,node,parents);
					}
				}
				continue;
			}
			parents[node] = $module;
			this.walkGraph(bundle,node,libTest,parents,children);
		}
	}
	shareGraph(toBundle,fromBundle,root,parents) {
		let toModule = toBundle.name;
		let fromModule = fromBundle.name;
		parents[root] = toModule;
		let succ = this.g.successors(root);
		let _g = 0;
		while(_g < succ.length) {
			let node = succ[_g];
			++_g;
			let current = parents[node];
			if(current == fromModule) {
				this.shareGraph(toBundle,fromBundle,node,parents);
			}
		}
	}
	commonParent(b1,b2) {
		let p1 = this.parentsOf(b1.name,{ });
		let p2 = this.parentsOf(b2.name,{ });
		let i1 = p1.length - 1;
		let i2 = p2.length - 1;
		let parent = this.mainModule;
		while(p1[i1] == p2[i2] && i1 >= 0) {
			parent = p1[i1];
			--i1;
			--i2;
		}
		return parent;
	}
	parentsOf($module,visited) {
		let pred = this.parenting.predecessors($module);
		let best = null;
		let _g = 0;
		while(_g < pred.length) {
			let p = pred[_g];
			++_g;
			if(Object.prototype.hasOwnProperty.call(visited,p)) {
				continue;
			}
			visited[p] = true;
			let parents = this.parentsOf(p,visited);
			if(best == null) {
				best = parents;
			} else if(parents.length < best.length) {
				best = parents;
			}
		}
		if(best == null) {
			best = [this.mainModule];
		} else {
			best.unshift($module);
		}
		return best;
	}
	isInLib(node,libTest) {
		let lib = this.libMap[node];
		if(lib != null && libTest.indexOf(lib) >= 0) {
			lib.roots[node] = true;
			return true;
		}
		return false;
	}
	uniqueModules(modulesList) {
		this.modules = [];
		this.moduleAlias = { };
		let modulesMap = { };
		let _g = 0;
		while(_g < modulesList.length) {
			let $module = modulesList[_g];
			++_g;
			if($module.indexOf("=") > 0) {
				let parts = $module.split("=");
				let name = this.getModuleAlias(parts[0]);
				if(!Object.prototype.hasOwnProperty.call(modulesMap,name)) {
					modulesMap[name] = [];
				}
				let _g = 0;
				let _g1 = parts[1].split(",");
				while(_g < _g1.length) {
					let m = _g1[_g];
					++_g;
					if(modulesMap[name].indexOf(m) < 0) {
						modulesMap[name].push(m);
					}
				}
			} else {
				let name = this.getModuleAlias($module);
				if(this.modules.indexOf(name) < 0) {
					this.modules.push(name);
				}
			}
		}
		let tmp = this.modules;
		let _g1 = [];
		let _g2 = 0;
		let _g3 = Reflect.fields(modulesMap);
		while(_g2 < _g3.length) {
			let name = _g3[_g2];
			++_g2;
			_g1.push("" + name + "=" + modulesMap[name].join(","));
		}
		this.modules = tmp.concat(_g1);
	}
	getModuleAlias($module) {
		if($module.indexOf("@") > 0) {
			let parts = $module.split("@");
			this.moduleAlias[parts[0]] = parts[1];
			return parts[0];
		}
		this.moduleAlias[$module] = $module;
		return $module;
	}
	linkEnums(root,list) {
		let _g = 0;
		while(_g < list.length) {
			let node = list[_g];
			++_g;
			this.g.setEdge(root,node);
		}
	}
	linkOrphans() {
		let sources = this.g.sources();
		let _g = 0;
		while(_g < sources.length) {
			let source = sources[_g];
			++_g;
			if(source != this.mainModule) {
				this.g.setEdge(this.mainModule,source);
			}
		}
		let _g1 = 0;
		let _g2 = ["$estr","$hxClasses","$hxEnums","Std"];
		while(_g1 < _g2.length) {
			let enforce = _g2[_g1];
			++_g1;
			if(!this.g.hasNode(enforce)) {
				continue;
			}
			if(!this.g.hasEdge(this.mainModule,enforce)) {
				this.g.setEdge(this.mainModule,enforce);
			}
		}
	}
	createBundle(name,isLib,libParams) {
		if(isLib == null) {
			isLib = false;
		}
		let bundle = { isMain : name == this.mainModule, isLib : isLib, libParams : libParams, name : name, alias : this.moduleAlias[name], nodes : [], indexes : [], exports : { }, shared : { }, imports : { }};
		if(!this.parenting.hasNode(name)) {
			this.parenting.setNode(name);
		}
		this.moduleMap[name] = bundle;
		return bundle;
	}
	expandLibs() {
		this.libMap = { };
		let libTest = [];
		let allNodes = this.parser.graph.nodes();
		let _g = 0;
		let _g1 = this.modules.length;
		while(_g < _g1) {
			let i = _g++;
			let $module = this.modules[i];
			if($module.indexOf("=") > 0) {
				let lib = this.resolveLib($module);
				this.mapLibTypes(allNodes,lib);
				libTest.push(lib);
			}
		}
		return libTest;
	}
	mapLibTypes(allNodes,lib) {
		let test = lib.test;
		let n = test.length;
		let _g = 0;
		let _g1 = allNodes.length;
		while(_g < _g1) {
			let i = _g++;
			let node = allNodes[i];
			let _g1 = 0;
			let _g2 = n;
			while(_g1 < _g2) {
				let j = _g1++;
				if(node.startsWith(test[j])) {
					this.libMap[node] = lib;
					break;
				}
			}
		}
	}
	resolveLib(name) {
		let parts = name.split("=");
		let newName = parts[0];
		let libParams = parts[1].split(",");
		let tmp = this.createBundle(newName,true,libParams);
		return { test : libParams, roots : { }, bundle : tmp};
	}
	addOnce(source,target) {
		let temp = target.slice();
		let _g = 0;
		while(_g < source.length) {
			let node = source[_g];
			++_g;
			if(target.indexOf(node) < 0) {
				temp.push(node);
			}
		}
		return temp;
	}
}
Extractor.__name__ = true;
class HxOverrides {
	static cca(s,index) {
		let x = s.charCodeAt(index);
		if(x != x) {
			return undefined;
		}
		return x;
	}
	static substr(s,pos,len) {
		if(len == null) {
			len = s.length;
		} else if(len < 0) {
			if(pos == 0) {
				len = s.length + len;
			} else {
				return "";
			}
		}
		return s.substr(pos,len);
	}
	static now() {
		return Date.now();
	}
}
HxOverrides.__name__ = true;
class HxSplit {
	static run(input,output,modules,debugMode,commonjs,debugSourceMap,dump,astHooks) {
		haxe_Log.trace = function(v,infos) {
			console.log(v);
		};
		let src = js_node_Fs.readFileSync(input,"utf8");
		let parser = new Parser(src,debugMode,commonjs);
		let sourceMap = debugMode ? new SourceMap(input,src) : null;
		modules = HxSplit.applyAstHooks(parser.mainModule,modules,astHooks,parser.graph);
		if(debugSourceMap) {
			HxSplit.dumpGraph(output,parser.graph);
		}
		let extractor = new Extractor(parser);
		extractor.process(parser.mainModule,modules,debugMode);
		let reporter = new Reporter(dump);
		let bundler = new Bundler(parser,sourceMap,extractor,reporter);
		let result = bundler.generate(src,output,commonjs,debugSourceMap);
		if(debugSourceMap) {
			HxSplit.dumpModules(output,extractor);
		}
		if(dump) {
			reporter.save(output);
		}
		return result;
	}
	static applyAstHooks(mainModule,modules,astHooks,graph) {
		if(astHooks == null || astHooks.length == 0) {
			return modules;
		}
		let _g = 0;
		while(_g < astHooks.length) {
			let hook = astHooks[_g];
			++_g;
			if(hook == null) {
				continue;
			}
			let addModules = hook(graph,mainModule);
			if(addModules != null) {
				modules = modules.concat(addModules);
			}
		}
		return modules;
	}
	static dumpModules(output,extractor) {
		haxe_Log.trace("Dump bundles: " + output + ".json",{ fileName : "tool/src/HxSplit.hx", lineNumber : 53, className : "HxSplit", methodName : "dumpModules"});
		let bundles = [extractor.main].concat(extractor.bundles);
		let _g = 0;
		while(_g < bundles.length) {
			let bundle = bundles[_g];
			++_g;
			Reflect.deleteField(bundle,"indexes");
			bundle.nodes.sort(function(s1,s2) {
				if(s1 == s2) {
					return 0;
				} else if(s1 < s2) {
					return -1;
				} else {
					return 1;
				}
			});
		}
		let out = JSON.stringify(bundles,null,"  ");
		js_node_Fs.writeFileSync(output + ".json",out);
	}
	static dumpGraph(output,g) {
		haxe_Log.trace("Dump graph: " + output + ".graph",{ fileName : "tool/src/HxSplit.hx", lineNumber : 66, className : "HxSplit", methodName : "dumpGraph"});
		let out = "";
		let _g = 0;
		let _g1 = g.nodes();
		while(_g < _g1.length) {
			let node = _g1[_g];
			++_g;
			if(node.charAt(0) != "$") {
				let _this = g.inEdges(node);
				let result = new Array(_this.length);
				let _g = 0;
				let _g1 = _this.length;
				while(_g < _g1) {
					let i = _g++;
					result[i] = _this[i].v.split("_").join(".");
				}
				let _g2 = [];
				let _g3 = 0;
				let _g4 = result;
				while(_g3 < _g4.length) {
					let v = _g4[_g3];
					++_g3;
					if(v.charAt(0) != "$") {
						_g2.push(v);
					}
				}
				let toNode = _g2;
				if(toNode.length == 0) {
					continue;
				}
				out += "+ " + node + " < " + toNode.join(", ") + "\n";
				let _this1 = g.outEdges(node);
				let result1 = new Array(_this1.length);
				let _g5 = 0;
				let _g6 = _this1.length;
				while(_g5 < _g6) {
					let i = _g5++;
					result1[i] = _this1[i].w.split("_").join(".");
				}
				let _g7 = [];
				let _g8 = 0;
				let _g9 = result1;
				while(_g8 < _g9.length) {
					let v = _g9[_g8];
					++_g8;
					if(v.charAt(0) != "$") {
						_g7.push(v);
					}
				}
				let fromNode = _g7;
				let _g10 = 0;
				while(_g10 < fromNode.length) {
					let dest = fromNode[_g10];
					++_g10;
					out += "  - " + dest + "\n";
				}
			}
		}
		js_node_Fs.writeFileSync(output + ".graph",out);
	}
}
$hx_exports["run"] = HxSplit.run;
HxSplit.__name__ = true;
Math.__name__ = true;
class MinifyId {
	constructor() {
		this.index = 0;
		this.map = { };
	}
	set(id) {
		this.map[id] = id;
	}
	get(id) {
		if(id.length <= 2) {
			return id;
		}
		let min = this.map[id];
		if(min == null) {
			let B16 = MinifyId.BASE_16;
			let i = this.index++;
			min = "";
			while(i > 15) {
				let add = i & 15;
				i = (i >> 4) - 1;
				min = B16[add] + min;
			}
			min = B16[i] + min;
			this.map[id] = min;
		}
		return min;
	}
}
MinifyId.__name__ = true;
class Parser {
	constructor(src,withLocation,commonjs) {
		this.objectMethods = { "defineProperty" : true, "defineProperties" : true, "freeze" : true, "assign" : true};
		this.reservedTypes = { "String" : true, "Math" : true, "Array" : true, "Date" : true, "Number" : true, "Boolean" : true, __map_reserved : true};
		this.tagHook = null;
		this.mainModule = "Main";
		let t0 = new Date().getTime();
		let engine = this.processInput(src,withLocation);
		let t1 = new Date().getTime();
		haxe_Log.trace("Parsed (" + engine + ") in: " + (t1 - t0) + "ms",{ fileName : "tool/src/Parser.hx", lineNumber : 32, className : "Parser", methodName : "new"});
		this.buildGraph(commonjs);
		let t2 = new Date().getTime();
		haxe_Log.trace("AST processed in: " + (t2 - t1) + "ms",{ fileName : "tool/src/Parser.hx", lineNumber : 36, className : "Parser", methodName : "new"});
	}
	processInput(src,withLocation) {
		let program = ast_Acorn.parse(src,{ ecmaVersion : 11, allowReserved : true, locations : withLocation});
		let engine = "Acorn.js";
		this.walkProgram(program);
		return engine;
	}
	buildGraph(commonjs) {
		let g = new graphlib_Graph({ directed : true, compound : true});
		let cpt = 0;
		let refs = 0;
		let _g = 0;
		let _g1 = Reflect.fields(this.types);
		while(_g < _g1.length) {
			let t = _g1[_g];
			++_g;
			++cpt;
			g.setNode(t,t);
		}
		if(!commonjs) {
			this.types["require"] = [];
			g.setNode("require","require");
			g.setEdge(this.mainModule,"require");
		}
		let _g2 = 0;
		let _g3 = Reflect.fields(this.types);
		while(_g2 < _g3.length) {
			let t = _g3[_g2];
			++_g2;
			refs += this.walk(g,t,this.types[t]);
		}
		haxe_Log.trace("Stats: " + cpt + " types, " + refs + " references",{ fileName : "tool/src/Parser.hx", lineNumber : 72, className : "Parser", methodName : "buildGraph"});
		this.typesCount = cpt;
		this.graph = g;
	}
	walk(g,id,nodes) {
		let refs = 0;
		let _gthis = this;
		let visitors = { Identifier : function(node) {
			let name = node.name;
			if(name != id && Object.prototype.hasOwnProperty.call(_gthis.types,name)) {
				g.setEdge(id,name);
				refs += 1;
			}
		}, AssignmentExpression : function(node,state,cont) {
			cont(node.right,state);
			cont(node.left,state);
		}};
		let _g = 0;
		while(_g < nodes.length) {
			let decl = nodes[_g];
			++_g;
			ast_Walk.recursive(decl,{ },visitors);
		}
		return refs;
	}
	walkProgram(program) {
		this.types = { };
		this.isEnum = { };
		this.isRequire = { };
		this.rootExpr = this.getBodyNodes(program).pop();
		if(this.rootExpr.type == "ExpressionStatement") {
			this.walkRootExpression(this.rootExpr.expression);
		} else {
			throw haxe_Exception.thrown("Expecting last node to be an ExpressionStatement");
		}
	}
	walkRootExpression(expr) {
		if(expr.type == "CallExpression") {
			this.walkRootFunction(expr.callee);
		} else {
			throw haxe_Exception.thrown("Expecting last node statement to be a function call");
		}
	}
	walkRootFunction(callee) {
		let block = this.getBodyNodes(callee)[0];
		if(block.type == "BlockStatement") {
			let body = this.getBodyNodes(block);
			this.walkDeclarations(body,true);
		} else {
			throw haxe_Exception.thrown("Expecting block of statements inside root function");
		}
	}
	walkDeclarations(body,isRoot) {
		if(isRoot) {
			this.rootBody = body;
		}
		let _g = 0;
		while(_g < body.length) {
			let node = body[_g];
			++_g;
			switch(node.type) {
			case "BlockStatement":
				this.inspectBlockStatement(node);
				break;
			case "ClassDeclaration":
				this.inspectClass(node.id,node);
				break;
			case "EmptyStatement":
				break;
			case "ExpressionStatement":
				this.inspectExpression(node.expression,node);
				break;
			case "FunctionDeclaration":
				this.inspectFunction(node.id,node);
				break;
			case "IfStatement":
				if(node.consequent.type == "ExpressionStatement") {
					this.inspectExpression(node.consequent.expression,node);
				} else {
					this.inspectIfStatement(node.test,node);
				}
				break;
			case "VariableDeclaration":
				this.inspectDeclarations(node.declarations,node);
				break;
			default:
				haxe_Log.trace("WARNING: Unexpected " + node.type + ", at character " + node.start,{ fileName : "tool/src/Parser.hx", lineNumber : 169, className : "Parser", methodName : "walkDeclarations"});
			}
		}
	}
	inspectBlockStatement(def) {
		let tagged = false;
		let _gthis = this;
		this.tagHook = function(name,decl) {
			if(decl == def) {
				return false;
			}
			if(!tagged) {
				_gthis.tag(name,def);
				tagged = true;
			}
			return false;
		};
		this.walkDeclarations(def.body,false);
		this.tagHook = null;
	}
	inspectIfStatement(test,def) {
		let _gthis = this;
		if(test.type == "BinaryExpression") {
			let path = this.getIdentifier(test.left);
			if(path.length > 1 && path[1] == "prototype") {
				this.tag(path[0],def);
			}
		} else if(test.type == "ConditionalExpression") {
			if(def.consequent.type == "BlockStatement") {
				this.tagHook = function(name,decl) {
					if(decl == def) {
						return false;
					}
					_gthis.tag(name,def);
					return true;
				};
				this.walkDeclarations(def.consequent.body,false);
				this.tagHook = null;
			}
		}
	}
	inspectFunction(id,def) {
		let path = this.getIdentifier(id);
		if(path.length > 0) {
			let name = path[0];
			this.tag(name,def);
		}
	}
	inspectClass(id,def) {
		let path = this.getIdentifier(id);
		if(path.length > 0) {
			let name = path[0];
			this.tag(name,def);
		}
	}
	inspectExpression(expression,def) {
		switch(expression.type) {
		case "AssignmentExpression":
			let path = this.getIdentifier(expression.left);
			if(path.length > 0) {
				let name = path[0];
				switch(name) {
				case "$hxClasses":case "$hx_exports":
					let moduleName = this.getIdentifier(expression.right);
					if(moduleName.length == 1) {
						this.tag(moduleName[0],def);
					}
					break;
				default:
					if(Object.prototype.hasOwnProperty.call(this.types,name)) {
						if(path[1] == "displayName") {
							this.trySetHot(name);
						} else if(path[1] == "__fileName__") {
							this.trySetHot(name);
						}
					}
					this.tag(name,def);
				}
			}
			break;
		case "CallExpression":
			let path1 = this.getIdentifier(expression.callee.object);
			let prop = this.getIdentifier(expression.callee.property);
			if(prop.length == 1 && path1.length == 1) {
				let name = path1[0];
				let member = prop[0];
				if(Object.prototype.hasOwnProperty.call(this.types,name)) {
					if(member == "main") {
						this.mainModule = name;
					}
					this.tag(name,def);
				} else if(name == "Object" && this.objectMethods[member] && expression.arguments != null && expression.arguments[0] != null) {
					let spath = this.getIdentifier(expression.arguments[0].object);
					if(spath.length == 1) {
						let sname = spath[0];
						if(Object.prototype.hasOwnProperty.call(this.types,sname)) {
							this.tag(sname,def);
						}
					}
				}
			}
			break;
		default:
		}
	}
	trySetHot(name) {
		if(this.isHot == null) {
			this.isHot = { };
		}
		if(Object.prototype.hasOwnProperty.call(this.isHot,name)) {
			this.isHot[name] = true;
		} else {
			this.isHot[name] = false;
		}
	}
	inspectDeclarations(declarations,def) {
		let _g = 0;
		while(_g < declarations.length) {
			let decl = declarations[_g];
			++_g;
			if(decl.id != null) {
				let name = decl.id.name;
				if(decl.init != null) {
					let init = decl.init;
					switch(init.type) {
					case "AssignmentExpression":
						let right = init.right;
						let type = right.type;
						if(type == "FunctionExpression") {
							this.tag(name,def);
						} else if(type == "ObjectExpression") {
							if(this.isEnumDecl(right)) {
								this.isEnum[name] = true;
							}
							this.tag(name,def);
						} else if(type == "Identifier") {
							this.tag(name,def);
						}
						break;
					case "CallExpression":
						if(this.isRequireDecl(init.callee)) {
							this.required(name,def);
						}
						break;
					case "FunctionExpression":
						this.tag(name,def);
						break;
					case "Identifier":
						if(name.charAt(0) != "$") {
							this.tag(name,def);
						}
						break;
					case "LogicalExpression":
						if(name == "$hxEnums") {
							this.tag(name,def);
						} else if(init.operator == "||" && init.right != null) {
							let id = this.getIdentifier(init.right);
							if(id.length > 0 && id[0].indexOf("_compat_") > 0) {
								this.tag(name,def);
							}
						}
						break;
					case "MemberExpression":
						if(init.object.type == "CallExpression" && this.isRequireDecl(init.object.callee)) {
							this.required(name,def);
						}
						break;
					case "ObjectExpression":
						if(this.isEnumDecl(init)) {
							this.isEnum[name] = true;
						}
						this.tag(name,def);
						break;
					default:
					}
				}
			}
		}
	}
	required(name,def) {
		this.isRequire[name] = true;
		this.tag(name,def);
	}
	tag(name,def) {
		if(this.tagHook != null && this.tagHook(name,def)) {
			return;
		}
		if(!Object.prototype.hasOwnProperty.call(this.types,name)) {
			if(this.reservedTypes[name]) {
				if(name != "__map_reserved") {
					def.__tag__ = "__reserved__";
				}
				return;
			}
			this.types[name] = [def];
		} else {
			this.types[name].push(def);
		}
		if(def.__tag__ == null) {
			def.__tag__ = name;
		}
	}
	isEnumDecl(node) {
		let props = node.properties;
		if(node.type == "ObjectExpression" && props != null && props.length > 0) {
			return this.getIdentifier(props[0].key)[0] == "__ename__";
		} else {
			return false;
		}
	}
	isRequireDecl(node) {
		if(node != null && node.type == "Identifier") {
			return node.name == "require";
		} else {
			return false;
		}
	}
	getBodyNodes(node) {
		if(((node.body) instanceof Array)) {
			return node.body;
		} else {
			return [node.body];
		}
	}
	getIdentifier(left) {
		if(left == null) {
			return [];
		}
		switch(left.type) {
		case "AssignmentExpression":
			return this.getIdentifier(left.right);
		case "Identifier":
			return [left.name];
		case "Literal":
			return [left.raw];
		case "MemberExpression":
			return this.getIdentifier(left.object).concat(this.getIdentifier(left.property));
		default:
			return [];
		}
	}
}
Parser.__name__ = true;
class Reflect {
	static fields(o) {
		let a = [];
		if(o != null) {
			let hasOwnProperty = Object.prototype.hasOwnProperty;
			for( var f in o ) {
			if(f != "__id__" && f != "hx__closures__" && hasOwnProperty.call(o,f)) {
				a.push(f);
			}
			}
		}
		return a;
	}
	static deleteField(o,field) {
		if(!Object.prototype.hasOwnProperty.call(o,field)) {
			return false;
		}
		delete(o[field]);
		return true;
	}
}
Reflect.__name__ = true;
class Reporter {
	constructor(enabled) {
		this.enabled = enabled;
		this.stats = { };
	}
	save(output) {
		if(!this.enabled) {
			return;
		}
		haxe_Log.trace("Size report: " + output + ".stats.json",{ fileName : "tool/src/Reporter.hx", lineNumber : 30, className : "Reporter", methodName : "save"});
		this.calculate_rec(this.stats);
		let raw = JSON.stringify(this.stats,null,"  ");
		js_node_Fs.writeFileSync(output + ".stats.json",raw);
		let src = js_node_Fs.readFileSync(js_node_Path.join(__dirname,"viewer.js"),"utf8");
		let viewer = "<!DOCTYPE html><body><script>var __STATS__ = " + raw + ";\n" + src + "</script></body>";
		js_node_Fs.writeFileSync(output + ".stats.html",viewer);
	}
	calculate_rec(group) {
		let total = 0;
		let _g = 0;
		let _g1 = Reflect.fields(group);
		while(_g < _g1.length) {
			let key = _g1[_g];
			++_g;
			total += group[key].size;
		}
		let _g2 = 0;
		let _g3 = Reflect.fields(group);
		while(_g2 < _g3.length) {
			let key = _g3[_g2];
			++_g2;
			let node = group[key];
			node.rel = Math.round(1000 * node.size / total) / 10;
			if(node.group != null) {
				this.calculate_rec(node.group);
			}
		}
	}
	includedBefore(size) {
		if(!this.enabled || size < 50) {
			return;
		}
		this.current.size += size;
		this.current.group["INCLUDE"] = { size : size, rel : 0};
	}
	start(bundle) {
		if(!this.enabled) {
			return;
		}
		this.current = { size : 0, rel : 0, group : { }};
		this.stats[bundle.name + ".js"] = this.current;
	}
	add(tag,size) {
		if(!this.enabled) {
			return;
		}
		this.current.size += size;
		if(tag == null || tag == "__reserved__" || tag.charAt(0) == "$") {
			return;
		}
		let parts = tag.indexOf("_$") < 0 ? tag.split("_") : this.safeSplit(tag);
		if(parts.length == 1) {
			parts.unshift("TOPLEVEL");
		}
		let parent = this.current;
		let _g = 0;
		while(_g < parts.length) {
			let p = parts[_g];
			++_g;
			if(parent.group == null) {
				parent.group = { };
			}
			let node = parent.group[p];
			if(node == null) {
				node = { size : 0, rel : 0};
				parent.group[p] = node;
			}
			node.size += size;
			parent = node;
		}
	}
	safeSplit(tag) {
		let p = [];
		let acc = "";
		let _g = 0;
		let _g1 = tag.length;
		while(_g < _g1) {
			let i = _g++;
			let c = tag.charAt(i);
			if(c != "_") {
				if(c != "$" || tag.charAt(i - 1) != "_") {
					acc += c;
				}
			} else if(tag.charAt(i + 1) != "$") {
				p.push(acc);
				acc = "";
			} else {
				acc += "_";
			}
		}
		p.push(acc);
		return p;
	}
}
Reporter.__name__ = true;
var SM = require("@elsassph/fast-source-map");
class SourceMap {
	constructor(input,src) {
		let p = src.lastIndexOf("//# sourceMappingURL=");
		if(p < 0) {
			return;
		}
		let srcName = StringTools.trim(HxOverrides.substr(src,p + "//# sourceMappingURL=".length,null));
		this.fileName = js_node_Path.join(js_node_Path.dirname(input),srcName);
		this.source = SM.decodeFile(this.fileName);
	}
	emitMappings(nodes,offset) {
		if(nodes.length == 0 || this.source == null) {
			return null;
		}
		let inc = [];
		let line = offset;
		let _g = 0;
		while(_g < nodes.length) {
			let node = nodes[_g];
			++_g;
			let _g1 = node.loc.start.line;
			let _g2 = node.loc.end.line + 1;
			while(_g1 < _g2) {
				let i = _g1++;
				inc[i] = line++;
			}
		}
		let output = [];
		let map = { version : 3, file : "", sourceRoot : "", sources : [], sourcesContent : [], names : [], mappings : null};
		let usedSources = [];
		try {
			let mappings = this.source.mappings;
			let srcLength = mappings.length;
			let maxLine = 0;
			let _g = 0;
			let _g1 = srcLength;
			while(_g < _g1) {
				let i = _g++;
				let mapping = mappings[i];
				if(!isNaN(inc[i])) {
					let _g = 0;
					while(_g < mapping.length) {
						let m = mapping[_g];
						++_g;
						usedSources[m.src] = true;
					}
					let mapLine = inc[i];
					output[mapLine] = mapping;
					if(mapLine > maxLine) {
						maxLine = mapLine;
					}
				}
			}
			let _g2 = 0;
			let _g3 = maxLine;
			while(_g2 < _g3) {
				let i = _g2++;
				if(output[i] == null) {
					output[i] = [];
				}
			}
			let _g4 = 0;
			let _g5 = this.source.sources.length;
			while(_g4 < _g5) {
				let i = _g4++;
				map.sources[i] = usedSources[i] ? this.source.sources[i] : "";
			}
			map.sourceRoot = this.source.sourceRoot;
			map.mappings = output;
			return SM.encode(map);
		} catch( _g ) {
			haxe_Log.trace("Invalid source-map",{ fileName : "tool/src/SourceMap.hx", lineNumber : 119, className : "SourceMap", methodName : "emitMappings"});
			return null;
		}
	}
	emitFile(output,map) {
		if(map == null) {
			return null;
		}
		map.file = js_node_Path.basename(output);
		return map;
	}
}
SourceMap.__name__ = true;
class Std {
	static string(s) {
		return js_Boot.__string_rec(s,"");
	}
}
Std.__name__ = true;
class StringTools {
	static isSpace(s,pos) {
		let c = HxOverrides.cca(s,pos);
		if(!(c > 8 && c < 14)) {
			return c == 32;
		} else {
			return true;
		}
	}
	static ltrim(s) {
		let l = s.length;
		let r = 0;
		while(r < l && StringTools.isSpace(s,r)) ++r;
		if(r > 0) {
			return HxOverrides.substr(s,r,l - r);
		} else {
			return s;
		}
	}
	static rtrim(s) {
		let l = s.length;
		let r = 0;
		while(r < l && StringTools.isSpace(s,l - r - 1)) ++r;
		if(r > 0) {
			return HxOverrides.substr(s,0,l - r);
		} else {
			return s;
		}
	}
	static trim(s) {
		return StringTools.ltrim(StringTools.rtrim(s));
	}
}
StringTools.__name__ = true;
var ast_Acorn = require("acorn");
var ast_Walk = require("acorn-walk");
var graphlib_Graph = require("graphlib").Graph;
class haxe_Exception extends Error {
	constructor(message,previous,native) {
		super(message);
		this.message = message;
		this.__previousException = previous;
		this.__nativeException = native != null ? native : this;
	}
	unwrap() {
		return this.__nativeException;
	}
	get_native() {
		return this.__nativeException;
	}
	static caught(value) {
		if(((value) instanceof haxe_Exception)) {
			return value;
		} else if(((value) instanceof Error)) {
			return new haxe_Exception(value.message,null,value);
		} else {
			return new haxe_ValueException(value,null,value);
		}
	}
	static thrown(value) {
		if(((value) instanceof haxe_Exception)) {
			return value.get_native();
		} else if(((value) instanceof Error)) {
			return value;
		} else {
			let e = new haxe_ValueException(value);
			return e;
		}
	}
}
haxe_Exception.__name__ = true;
class haxe_Log {
	static formatOutput(v,infos) {
		let str = Std.string(v);
		if(infos == null) {
			return str;
		}
		let pstr = infos.fileName + ":" + infos.lineNumber;
		if(infos.customParams != null) {
			let _g = 0;
			let _g1 = infos.customParams;
			while(_g < _g1.length) {
				let v = _g1[_g];
				++_g;
				str += ", " + Std.string(v);
			}
		}
		return pstr + ": " + str;
	}
	static trace(v,infos) {
		let str = haxe_Log.formatOutput(v,infos);
		if(typeof(console) != "undefined" && console.log != null) {
			console.log(str);
		}
	}
}
haxe_Log.__name__ = true;
class haxe_ValueException extends haxe_Exception {
	constructor(value,previous,native) {
		super(String(value),previous,native);
		this.value = value;
	}
	unwrap() {
		return this.value;
	}
}
haxe_ValueException.__name__ = true;
class haxe_ds_StringMap {
}
haxe_ds_StringMap.__name__ = true;
class haxe_iterators_ArrayIterator {
	constructor(array) {
		this.current = 0;
		this.array = array;
	}
	hasNext() {
		return this.current < this.array.length;
	}
	next() {
		return this.array[this.current++];
	}
}
haxe_iterators_ArrayIterator.__name__ = true;
class js_Boot {
	static __string_rec(o,s) {
		if(o == null) {
			return "null";
		}
		if(s.length >= 5) {
			return "<...>";
		}
		let t = typeof(o);
		if(t == "function" && (o.__name__ || o.__ename__)) {
			t = "object";
		}
		switch(t) {
		case "function":
			return "<function>";
		case "object":
			if(((o) instanceof Array)) {
				let str = "[";
				s += "\t";
				let _g = 0;
				let _g1 = o.length;
				while(_g < _g1) {
					let i = _g++;
					str += (i > 0 ? "," : "") + js_Boot.__string_rec(o[i],s);
				}
				str += "]";
				return str;
			}
			let tostr;
			try {
				tostr = o.toString;
			} catch( _g ) {
				return "???";
			}
			if(tostr != null && tostr != Object.toString && typeof(tostr) == "function") {
				let s2 = o.toString();
				if(s2 != "[object Object]") {
					return s2;
				}
			}
			let str = "{\n";
			s += "\t";
			let hasp = o.hasOwnProperty != null;
			let k = null;
			for( k in o ) {
			if(hasp && !o.hasOwnProperty(k)) {
				continue;
			}
			if(k == "prototype" || k == "__class__" || k == "__super__" || k == "__interfaces__" || k == "__properties__") {
				continue;
			}
			if(str.length != 2) {
				str += ", \n";
			}
			str += s + k + " : " + js_Boot.__string_rec(o[k],s);
			}
			s = s.substring(1);
			str += "\n" + s + "}";
			return str;
		case "string":
			return o;
		default:
			return String(o);
		}
	}
}
js_Boot.__name__ = true;
var js_node_Fs = require("fs");
class js_node_KeyValue {
	static get_key(this1) {
		return this1[0];
	}
	static get_value(this1) {
		return this1[1];
	}
}
var js_node_Path = require("path");
class js_node_stream_WritableNewOptionsAdapter {
	static from(options) {
		if(!Object.prototype.hasOwnProperty.call(options,"final")) {
			Object.defineProperty(options,"final",{ get : function() {
				return options.final_;
			}});
		}
		return options;
	}
}
class js_node_url_URLSearchParamsEntry {
	static _new(name,value) {
		let this1 = [name,value];
		return this1;
	}
	static get_name(this1) {
		return this1[0];
	}
	static get_value(this1) {
		return this1[1];
	}
}
if(typeof(performance) != "undefined" ? typeof(performance.now) == "function" : false) {
	HxOverrides.now = performance.now.bind(performance);
}
{
	String.__name__ = true;
	Array.__name__ = true;
	Date.__name__ = "Date";
}
js_Boot.__toStr = ({ }).toString;
Bundler.REQUIRE = "var require = (function(r){ return function require(m) { return r[m]; } })($s.__registry__ || {});\n";
Bundler.SCOPE = "typeof exports != \"undefined\" ? exports : typeof window != \"undefined\" ? window : typeof self != \"undefined\" ? self : this";
Bundler.GLOBAL = "typeof window != \"undefined\" ? window : typeof global != \"undefined\" ? global : typeof self != \"undefined\" ? self : this";
Bundler.FUNCTION_START = "(function ($hx_exports, $global) { \"use-strict\";\n";
Bundler.FUNCTION_END = "})(" + "typeof exports != \"undefined\" ? exports : typeof window != \"undefined\" ? window : typeof self != \"undefined\" ? self : this" + ", " + "typeof window != \"undefined\" ? window : typeof global != \"undefined\" ? global : typeof self != \"undefined\" ? self : this" + ");\n";
Bundler.WP_START = "/* eslint-disable */ \"use strict\"\n";
Bundler.FRAGMENTS = { MAIN : { EXPORTS : "var $hx_exports = module.exports, $global = global;\n", SHARED : "var $s = $global.$hx_scope = $global.$hx_scope || {};\n"}, CHILD : { EXPORTS : "var $hx_exports = module.exports, $global = global;\n", SHARED : "var $s = $global.$hx_scope, $_;\n"}};
Bundler.generateHtml = global.generateHtml;
MinifyId.BASE_16 = "abcdefghijklmnop".split("");
SourceMap.SRC_REF = "//# sourceMappingURL=";
})(typeof exports != "undefined" ? exports : typeof window != "undefined" ? window : typeof self != "undefined" ? self : this, {});
