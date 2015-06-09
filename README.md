# tilestrata-vtile-raster
[![NPM version](http://img.shields.io/npm/v/tilestrata-vtile-raster.svg?style=flat)](https://www.npmjs.org/package/tilestrata-vtile-raster)
[![Build Status](http://img.shields.io/travis/naturalatlas/tilestrata-vtile-raster/master.svg?style=flat)](https://travis-ci.org/naturalatlas/tilestrata-vtile-raster)
[![Coverage Status](http://img.shields.io/coveralls/naturalatlas/tilestrata-vtile-raster/master.svg?style=flat)](https://coveralls.io/r/naturalatlas/tilestrata-vtile-raster)

A [TileStrata](https://github.com/naturalatlas/tilestrata) plugin for rendering [mapnik](http://mapnik.org/) vector tiles (pbf) into raster images. Use the [tilestrata-vtile](https://github.com/naturalatlas/tilestrata-vtile) plugin for generating the vector tiles. To use this plugin, you must have [node-mapnik](https://github.com/mapnik/node-mapnik) in your dependency tree.

### Sample Usage

```js
var vtile = require('tilestrata-vtile');
var vtileraster = require('tilestrata-vtile-raster');

var opts_vector = {
    xml: '/path/to/map.xml',
    tileSize: 256,
    metatile: 1,
    bufferSize: 128
};

var opts_raster = {
    xml: '/path/to/map-vt.xml',
    tileSize: 256,
    metatile: 1,
    bufferSize: 128
};

server.layer('mylayer')
    .route('t.pbf').use(vtile(opts_vector))
    .route('t.png').use(vtileraster(opts_raster, {
        tilesource: ['mylayer', 't.pbf']
    }))
    .route('i.json').use(vtileraster(opts_raster, {
        tilesource: ['mylayer', 't.pbf'],
        interactivity: true
    }));
```

### Mapnik XML Notes

tilestrata-vtile expects a typical mapnik xml file - the same as tilestrata-mapnik would expect. The XML for tilestrata-vtile-raster must have specialized for using vector-tiles however. It needs to differ from the typical xml file in the following ways:

- The `srs` property must be removed or set to Web Mercator for each layer. *Mapnik reprojects the source data before putting it into vector tiles*
- The `Datasource` for each layer must be removed. *Mapnik will try to get the data from the datasource instead of the vector tile if `Datasource` is still set*


## Contributing

Before submitting pull requests, please update the [tests](test) and make sure they all pass.

```sh
$ npm test
```

## License

Copyright &copy; 2015 [Natural Atlas, Inc.](https://github.com/naturalatlas) & [Contributors](https://github.com/naturalatlas/tilestrata-vtile-raster/graphs/contributors)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
