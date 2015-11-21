var vtileraster = require('../index.js');
var tilestrata = require('tilestrata');
var TileServer = tilestrata.TileServer;
var TileRequest = tilestrata.TileRequest;
var Backend = require('../backend.js');
var assert = require('chai').assert;
var assertImage = require('./utils/assertImage.js');
var fs = require('fs');

describe('"tilestrata-vtile-raster"', function() {
	it('should match tilelive-mapnik metatile calculation (consistency)', function() {
		// this test is to enforce consistency w/tilelive-mapnik/tilestrata-mapnik
		// https://github.com/mapbox/tilelive-mapnik/blob/37a96814534910b4b7df48ce2fad119edd7defe4/lib/render.js
		var EARTH_RADIUS = 6378137;
		var EARTH_DIAMETER = EARTH_RADIUS * 2;
		var EARTH_CIRCUMFERENCE = EARTH_DIAMETER * Math.PI;
		var MAX_RES = EARTH_CIRCUMFERENCE / 256;
		var ORIGIN_SHIFT = EARTH_CIRCUMFERENCE / 2;

		function tileliveCalculateMetatile(options) {
			var z = +options.z, x = +options.x, y = +options.y;
			var total = 1 << z;
			var resolution = MAX_RES / total;

			// Make sure we start at a metatile boundary.
			x -= x % options.metatile;
			y -= y % options.metatile;

			// Make sure we don't calculcate a metatile that is larger than the bounds.
			var metaWidth  = Math.min(options.metatile, total, total - x);
			var metaHeight = Math.min(options.metatile, total, total - y);

			// Generate all tile coordinates that are within the metatile.
			var tiles = [];
			for (var dx = 0; dx < metaWidth; dx++) {
				for (var dy = 0; dy < metaHeight; dy++) {
					tiles.push([ z, x + dx, y + dy ]);
				}
			}

			var minx = (x * 256) * resolution - ORIGIN_SHIFT;
			var miny = -((y + metaHeight) * 256) * resolution + ORIGIN_SHIFT;
			var maxx = ((x + metaWidth) * 256) * resolution - ORIGIN_SHIFT;
			var maxy = -((y * 256) * resolution - ORIGIN_SHIFT);
			return {
				width: metaWidth * options.tileSize,
				height: metaHeight * options.tileSize,
				x: x, y: y,
				tiles: tiles,
				bbox: [ minx, miny, maxx, maxy ]
			};
		}

		var req = {metatile: 4, z: 13, x: 1588, y: 2952};
		var tilelive_result = tileliveCalculateMetatile(req);
		var tilestrata_result = Backend.calculateMetatile(req.metatile, req.z, req.x, req.y);
		assert.equal(tilelive_result.x, tilestrata_result[1], 'x');
		assert.equal(tilelive_result.y, tilestrata_result[2], 'y');
	});
	it('should be able to rasterize output', function(done) {
		var server = new TileServer();

		var opts = {
			xml: __dirname + '/data/test.xml',
			metatile: 4,
			bufferSize: 128
		};

		var req = TileRequest.parse('/layer/5/5/12/tile.png');
		server.layer('layer').route('tile.pbf').use({
			serve: function(server, req, callback) {
				return callback(null, fs.readFileSync(__dirname + '/data/world_metatile.pbf'), {});
			}
		});
		server.layer('layer').route('tile.png').use(vtileraster(opts, {
			tilesource: ['layer', 'tile.pbf']
		}));

		server.initialize(function(err) {
			assert.isFalse(!!err, err);
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(headers['Content-Type'], 'image/png');
				assert.instanceOf(buffer, Buffer);
				assertImage(__dirname + '/fixtures/world.png', buffer);
				done();
			});
		});
	});
	it('should be able to rasterize output when caches are disabled', function(done) {
		var server = new TileServer();

		var opts = {
			xml: __dirname + '/data/test.xml',
			metatile: 4,
			bufferSize: 128
		};

		var req = TileRequest.parse('/layer/5/5/12/tile.png');
		req.headers['x-tilestrata-skipcache'] = '1';

		server.layer('layer').route('tile.pbf').use({
			serve: function(server, req, callback) {
				return callback(null, fs.readFileSync(__dirname + '/data/world_metatile.pbf'), {});
			}
		});
		server.layer('layer').route('tile.png').use(vtileraster(opts, {
			tilesource: ['layer', 'tile.pbf']
		}));

		server.initialize(function(err) {
			assert.isFalse(!!err, err);
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(headers['Content-Type'], 'image/png');
				assert.instanceOf(buffer, Buffer);
				assertImage(__dirname + '/fixtures/world.png', buffer);
				done();
			});
		});
	});
	it('should be able to rasterize 2X output', function(done) {
		var server = new TileServer();

		var opts = {
			xml: __dirname + '/data/test.xml',
			metatile: 4,
			bufferSize: 256,
			tileSize: 512,
			scale: 2
		};

		var req = TileRequest.parse('/layer/5/5/12/tile.png');
		server.layer('layer').route('tile.pbf').use({
			serve: function(server, req, callback) {
				return callback(null, fs.readFileSync(__dirname + '/data/world_metatile.pbf'), {});
			}
		});
		server.layer('layer').route('tile.png').use(vtileraster(opts, {
			tilesource: ['layer', 'tile.pbf']
		}));

		server.initialize(function(err) {
			assert.isFalse(!!err, err);
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(headers['Content-Type'], 'image/png');
				assert.instanceOf(buffer, Buffer);
				// fs.writeFileSync(__dirname + '/fixtures/world@2x.png', buffer);
				assertImage(__dirname + '/fixtures/world@2x.png', buffer);
				done();
			});
		});
	});
	it('should be able to build utfgrid', function(done) {
		var server = new TileServer();

		var opts = {
			xml: __dirname + '/data/test.xml',
			metatile: 4,
			bufferSize: 128
		};

		var req = TileRequest.parse('/layer/5/5/12/tile.json');
		server.layer('layer').route('tile.pbf').use({
			serve: function(server, req, callback) {
				return callback(null, fs.readFileSync(__dirname + '/data/world_metatile.pbf'), {});
			}
		});
		server.layer('layer').route('tile.json').use(vtileraster(opts, {
			tilesource: ['layer', 'tile.pbf'],
			interactivity: true
		}));

		server.initialize(function(err) {
			assert.isFalse(!!err, err);
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
				assert.instanceOf(buffer, Buffer);

				var json_actual = buffer.toString('utf8');
				var json_expected = fs.readFileSync(__dirname + '/fixtures/world.json', 'utf8');
				assert.equal(json_actual, json_expected);

				// for utfmerge, to prevent reparsing
				assert.deepEqual(buffer._utfgrid, JSON.parse(json_expected));

				done();
			});
		});
	});
	it('should support overzooming', function(done) {
		var server = new TileServer();

		var opts = {
			xml: __dirname + '/data/test.xml',
			metatile: 4,
			bufferSize: 128
		};


		var req = TileRequest.parse('/layer/5/5/12/tile.png');
		server.layer('vtilelayer', {maxZoom: 4}).route('tile.pbf').use({
			serve: function(server, req, callback) {
				assert.equal(req.z, 4);
				return callback(null, fs.readFileSync(__dirname + '/data/world_metatile.pbf'), {});
			}
		});
		server.layer('layer').route('tile.png').use(vtileraster(opts, {
			tilesource: ['vtilelayer', 'tile.pbf']
		}));

		server.initialize(function(err) {
			assert.isFalse(!!err, err);
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(headers['Content-Type'], 'image/png');
				assert.instanceOf(buffer, Buffer);
				assertImage(__dirname + '/fixtures/world_overzoom.png', buffer);
				done();
			});
		});
	});
});
