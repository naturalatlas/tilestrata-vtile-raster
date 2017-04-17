var async = require('async');
var path = require('path');
var mapnik = require('mapnik');
var TileStrata = require('tilestrata');
var TileRequest = TileStrata.TileRequest;
var AsyncCache = require('active-cache/async');
var dependency = require('tilestrata-dependency');

var versionParts = mapnik.version.split('.');
var NODE_MAPNIK_MAJORMINOR = Number(versionParts[0] + '.' + Number(versionParts[1]));

function Backend(server, options) {
	var self = this;

	this.xml = options.xml;
	this.scale = options.scale;
	this.tileSize = options.tileSize;
	this.resolution = options.resolution;
	this.interactivity = options.interactivity;
	this.format = this.interactivity ? 'utf' : (options.format || 'png');
	this.options = options;

	this.pbflayer = options.tilesource[0];
	this.pbffile = options.tilesource[1];

	this.tilesource = dependency(this.pbflayer, this.pbffile);
	this.bufferSize = options.bufferSize;
	this.metatile = options.metatile;

	this.source_max_zoom = server.layer(this.pbflayer).options.maxZoom;

	this.server = server;
	this.map = null;

	this.metatilecache = new AsyncCache({
		max: options.cacheMax || 16,
		maxAge: options.cacheMaxAge || 1000 * 15,
		interval: options.cacheClearInterval || 5000,
		load: function(key, callback) {
			var info = key.split(',');
			var metatile_z = +info[0];
			var metatile_x = +info[1];
			var metatile_y = +info[2];
			var skipcache = !!parseInt(info[3], 10);
			var metatile_req = new TileRequest(metatile_x, metatile_y, metatile_z, self.pbflayer, self.pbffile);
			if (skipcache) metatile_req.headers['x-tilestrata-skipcache'] = '*';
			self.getRasterMetatile(metatile_req, callback);
		}
	});
}

Backend.prototype.initialize = function(callback) {
	// initialize mapnik
	mapnik.register_default_input_plugins();
	if (this.options.fontdir) {
		mapnik.register_fonts(this.options.fontdir, {recurse: true});
	}
	if (this.options.autoLoadFonts) {
		if (mapnik.register_default_fonts) mapnik.register_default_fonts();
		if (mapnik.register_system_fonts) mapnik.register_system_fonts();
	}

	// initialize map
	var mapOptions = {base: path.dirname(this.xml) + '/'};
	var dim = this.metatile * this.tileSize;
	this.map = new mapnik.Map(dim, dim);
	this.map.load(this.xml, mapOptions, callback);
};

Backend.prototype.getTile = function(req, callback) {
	var self = this;

	function finish(err, buffer) {
		if (err) return callback(err);
		if (self.interactivity) {
			var utfgrid = buffer;
			buffer = new Buffer(JSON.stringify(utfgrid), 'utf8');
			buffer._utfgrid = utfgrid;
		}
		callback(null, buffer, self.getHeader(buffer));
	}

	var skipcache = req.headers['x-tilestrata-skipcache'] ? '1' : '0';
	var metatileCoords = Backend.calculateMetatile(this.metatile, req.z, req.x, req.y);
	var dx = req.x - metatileCoords[1];
	var dy = req.y - metatileCoords[2];
	var key = metatileCoords.join(',') + ',' + skipcache;
	this.metatilecache.get(key, function(err, tiles) {
		if (err) return callback(err);
		finish(null, tiles[dx + ',' + dy]);
	});
};

/**
 * Returns tile coordinates of a tile that would have
 * same extent as the metatile for the given tile coordinates
 *
 * @param  {int} z
 * @param  {int} x
 * @param  {int} y
 * @return {object}
 */
Backend.prototype.getVectorTileInfo = function(z, x, y) {
	var dz;
	if (this.metatile === 1) dz = 0;
	else if (this.metatile === 2) dz = 1;
	else if (this.metatile === 4) dz = 2;
	else if (this.metatile === 8) dz = 3;
	else throw new Error('Unsupported metatile setting: ' + this.metatile);

	return {
		x: Math.floor(x / this.metatile),
		y: Math.floor(y / this.metatile),
		z: z - dz
	};
};

Backend.prototype.getRasterMetatile = function(metatile_req, callback) {
	var self = this;
	this.getVectorMetatile(metatile_req, function(err, vtile) {
		if (err) return callback(err);
		self.rasterize(metatile_req, vtile, function(err, image) {
			if (err) return callback(err);
			self.sliceMetatile(image, callback);
		});
	});
};

Backend.prototype.getVectorMetatile = function(metatile_req, callback) {
	var self = this;

	// overzooming
	if (this.source_max_zoom && metatile_req.z > this.source_max_zoom) {
		var dz = metatile_req.z - this.source_max_zoom;
		var d = 1 << dz;
		metatile_req = metatile_req.clone();
		metatile_req.x = Math.floor(metatile_req.x / d);
		metatile_req.y = Math.floor(metatile_req.y / d);
		metatile_req.z = this.source_max_zoom;
	}

	this.tilesource.serve(this.server, metatile_req, function(err, buffer) {
		if (err) return callback(err);
		var meta = self.getVectorTileInfo(metatile_req.z, metatile_req.x, metatile_req.y);

		// only use the vector tile instance directly if the extent is valid for the requested tile,
		// which won't be the case for metatiling and overzooming
		if (buffer._vtile instanceof mapnik.VectorTile
			&& buffer._vx === meta.x
			&& buffer._vy === meta.y
			&& buffer._vz === meta.z) {
			return callback(null, buffer._vtile);
		}

		var vtile = new mapnik.VectorTile(meta.z, meta.x, meta.y);

		// prevents "cannot accept empty buffer as protobuf"
		if (buffer.length) {
			vtile._srcbytes = buffer.length;
			vtile.setData(buffer, function(err) {
				if (err) return callback(err);
				if (NODE_MAPNIK_MAJORMINOR < 3.5) {
					return vtile.parse(function(err) {
						callback(err, vtile);
					});
				}
				callback(null, vtile);
			});
		} else {
			callback(null, vtile);
		}
	});
};

Backend.prototype.rasterize = function(metatile_req, vtile, callback) {
	var self = this;
	var image;
	var dim = self.metatile * self.tileSize;

	// metatile coordinates not considering overzooming
	var meta = this.getVectorTileInfo(metatile_req.z, metatile_req.x, metatile_req.y);

	var options = {
		scale: self.scale,
		buffer_size: self.bufferSize,
		z: meta.z,
		x: meta.x,
		y: meta.y,
		// vtile.z will be less than z if metatiling is used
		// this forces the real scale denominator to be used
		scale_denominator: 559082264.028 / (1 << metatile_req.z) / self.scale
	};

	if (self.interactivity) {
		image = new mapnik.Grid(dim, dim);
		options.layer = self.map.parameters.interactivity_layer;
		options.fields = self.map.parameters.interactivity_fields.split(',');
		options.resolution = self.resolution;
	} else {
		image = new mapnik.Image(dim, dim);
	}

	vtile.render(self.map, image, options, callback);
};

/**
 * Returns an object containing tile images from a metatile
 *
 * {
 *    "0,0": mapnik.Image,
 *    "1,0": mapnik.Image,
 *    "1,1": mapnik.Image,
 *    "0,1": mapnik.Image
 * }
 *
 * @param  {mapnik.Image|mapnik.Grid} image
 * @param  {Function} callback (err, object)
 * @return {void}
 */
Backend.prototype.sliceMetatile = function(image, callback) {
	var self = this;
	var result = {};
	var coords = [];
	for (var dx = 0; dx < this.metatile; dx++) {
		for (var dy = 0; dy < this.metatile; dy++) {
			coords.push({x: dx, y: dy});
		}
	}
	async.eachSeries(coords, function(coord, callback) {
		var dx = coord.x;
		var dy = coord.y;
		var view = image.view(dx * self.tileSize, dy * self.tileSize, self.tileSize, self.tileSize);
		self.encodeImage(view, {}, function(err, buffer) {
			if (!err) result[dx + ',' + dy] = buffer;
			callback(err);
		});
	}, function(err) {
		callback(err, result);
	});
};

Backend.prototype.encodeImage = function(image, options, callback) {
	if (this.interactivity) {
		image.encode(options, callback);
	} else {
		image.encode(this.format, options, callback);
	}
};

Backend.prototype.getHeader = function() {
	var header = {};

	if (this.interactivity) {
		header['Content-Type'] = 'application/json; charset=utf-8';
	} else {
		header['Content-Type'] = 'image/' + this.format;
	}

	return header;
};

Backend.calculateMetatile = function(metatile, z, x, y) {
	var meta_z = z;
	var meta_x = Math.floor(x / metatile) * metatile;
	var meta_y = Math.floor(y / metatile) * metatile;
	return [meta_z, meta_x, meta_y];
};

module.exports = Backend;
