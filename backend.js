var mapnik = require('mapnik');
var AsyncCache = require('async-cache');
var dependency = require('tilestrata-dependency');

module.exports = Backend;

function Backend(server, options){
	var self = this;

	this.xml = options.xml;
	this.scale = options.scale;
	this.tileSize = options.tileSize;
	this.resolution = options.resolution;
	this.interactivity = options.interactivity;
	this.format = this.interactivity ? "json" : (options.format || "png");

	this.tilesource = dependency(options.tilesource[0], options.tilesource[1]);
	this.bufferSize = this.tilesource.bufferSize;
	this.metatile = this.tilesource.metatile;

	this.server = server;
	this.map = null;

	this.tilecache = new AsyncCache({
		max: 64,
		maxAge: 1000*30,
		load: function(key, callback){
			var info = key.split(',');
			var z = +info[0];
			var x = +info[1];
			var y = +info[2];
			var meta_z = z;
			var meta_x = Math.floor(x / self.metatile) * self.metatile;
			var meta_y = Math.floor(y / self.metatile) * self.metatile;
			var dx = x - meta_x;
			var dy = y - meta_y;
			var key = [meta_z, meta_x, meta_y].join(',');
			self.metatilecache.get(key, function(err, tiles){
				if(err) return callback(err);
				callback(null, tiles[dx+","+dy]);
			});
		}
	});

	this.metatilecache = new AsyncCache({
		max: 64,
		maxAge: 1000*30,
		load: function(key, callback){
			var info = key.split(',');
			self.getRasterMetatile(+info[0], +info[1], +info[2], function(err, metatile){
				if(err) return callback(err);
				self.sliceMetatile(metatile, callback);
			});
		}
	});
}

Backend.prototype.initialize = function(callback) {
	var dim = this.metatile * this.tileSize;
	this.map = new mapnik.Map(dim, dim);
	this.map.load(this.xml, callback);
}

Backend.prototype.getTile = function(z, x, y, callback){
	var self = this;
	tilecache.get([z,x,y].join(','), function(err, buffer){
		if(err) return callback(err);
		callback(null, buffer, self.getHeader(buffer));
	});
}

/**
 * Returns tile coordinates of a tile that would have
 * same extent as the metatile for the given tile coordinates
 * 
 * @param  {int} z
 * @param  {int} x
 * @param  {int} y
 * @return {object}
 */
Backend.prototype.getVectorTileInfo = function(z, x, y){
	var dz;
	if(this.metatile === 1) dz = 0;
	else if(this.metatile === 2) dz = 1;
	else if(this.metatile === 4) dz = 2;
	else if(this.metatile === 8) dz = 3;
	else throw new Error("Unsupported metatile setting: "+this.metatile);

	return {
		x: Math.floor(x / this.metatile),
		y: Math.floor(y / this.metatile),
		z: z - dz
	};
}

Backend.prototype.getVectorMetatile = function(z, x, y, callback){
	this.tilesource.serve(this.server, {
		z: z,
		x: x,
		y: y
	}, function(err, buffer, headers){
		if(err) return callback(err);
		if (buffer instanceof mapnik.VectorTile) return callback(null, buffer);

		var meta = self.getVectorTileInfo(z, x, y);
		var vtile = new mapnik.VectorTile(meta.z, meta.x, meta.y);
		vtile._srcbytes = buffer.length;
		vtile.setData(data);
		vtile.parse(function(err){
			callback(err, vtile);
		})
	})
}

Backend.prototype.getRasterMetatile = function(z, x, y, callback){
	var self = this;
	this.getVectorMetatile(function(err, vtile){
		if(err) return callback(err);

		var image;
		var dim = self.metatile * self.tileSize;
		var options = {
			scale: self.scale, 
			buffer_size: self.tilesource.bufferSize,

			//vtile.z will be less than z if metatiling is used
			//this forces the real scale denominator to be used
			scale_denominator:  559082264.028 / (1 << z)
		};

		if(self.interactivity){
			image = new mapnik.Grid(dim,dim);
			options.layer = self.map.parameters.interactivity_layer;
			options.fields = self.map.parameters.interactivity_fields.split(',');
			options.resolution = self.resolution;
		} else {
			image = new mapnik.Image(dim,dim);
		}


		vtile.render(self.map, image, options, callback);
	});
}

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
	for(var dx = 0; dx < this.metatile; dx++){
		for(var dy = 0; dy < this.metatile; dy++){
			coords.push({x: dx, y: dy});
		}
	}
	async.eachSeries(coords, function(coord, callback){
		var dx = coord.x;
		var dy = coord.y;
		var view = image.view(dx*self.tileSize, y*self.tileSize, self.tileSize, self.tileSize);
		self.encodeImage(view, {}, function(err, buffer){
			if(!err) result[dx+","+dy] = buffer;
			callback(err);
		});
	}, function(err){
		callback(err, result)
	})
};

Backend.prototype.encodeImage = function(image, options, callback){
	if(this.interactivity){
		view.encode(options, callback);
	} else {
		view.encode(this.format, options, callback);
	}
}

Backend.prototype.getHeader = function(buffer){
	var header = {};

	if(this.interactivity) {
		header['Content-Type'] = 'application/json'; 
	} else {
		header['Content-Type'] = 'image/'+this.format;
	}

	return header;
}