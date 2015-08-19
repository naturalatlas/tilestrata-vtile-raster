var mapnik = require('mapnik');
var assert = require('chai').assert;

function im(image) {
	if (typeof image === 'string') return new mapnik.Image.open(image);
	return new mapnik.Image.fromBytesSync(image);
}

module.exports = function(expected, actual) {
	assert.equal(im(expected).compare(im(actual)), 0, 'Images should be equal');
};
