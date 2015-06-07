var _ = require('lodash');
var vtileraster = require('../index.js');
var tilestrata = require('tilestrata');
var TileServer = tilestrata.TileServer;
var TileRequest = tilestrata.TileRequest;
var assert = require('chai').assert;
var assertImage = require('./utils/assertImage.js');
var fs = require('fs');

describe('"tilestrata-vtile-raster"', function() {
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
			tilesource: ['layer','tile.pbf']
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
			tilesource: ['layer','tile.pbf'],
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
});
