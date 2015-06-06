# tilestrata-vtile-rasterizer
Renders mapnik vector tiles to images

### Sample Usage

```js
var rasterizer = require('tilestrata-vtile-rasterizer');

server.layer('mylayer')
    .route('tile.png').use(rasterizer({
        tilesource: ['vtile-layer', 't.pbf'],
        xml: '/path/to/map.xml',
        scale: 1,
        tileSize: 256
    })
    .route('tile.json').use(rasterizer({
        tilesource: ['vtile-layer', 't.pbf'],
        xml: '/path/to/map.xml',
        scale: 1,
        tileSize: 256,
        interactivity: true
    }));
```
