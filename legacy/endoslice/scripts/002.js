
// ---- PLYLoader / STLLoader / OBJLoader embutidos (Three.js r128 compatible) ----
// Carregados inline para evitar falha de rede que bloqueia scripts subsequentes.
// Fonte: three.js r128 examples, minificados e adaptados.
// ---- PLYLoader / STLLoader / OBJLoader inline (THREE.js r128 compatible) ----
// Reescrito como ES6 classes para evitar erro "Class constructor cannot be invoked without 'new'"
(function(){

// ---- PLYLoader ----
class _PLYLoader extends THREE.Loader {
    constructor(manager) { super(manager); this.propertyNameMapping = {}; }
    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setResponseType('arraybuffer');
        loader.load(url, (data) => {
            try {
                onLoad(this.parse(data));
            } catch (e) {
                if (onError) onError(e); else console.error(e);
            }
        }, onProgress, onError);
    }
    parse(data) {
        function parseHeader(data) {
            const patternHeader = /ply([\s\S]*)end_header\r?\n/;
            let headerText = '';
            let headerLength = 0;
            const result = patternHeader.exec(new TextDecoder().decode(data));
            if (result !== null) {
                headerText = result[1];
                headerLength = new Blob([result[0]]).size;
            }
            const header = { comments: [], elements: [], headerLength: headerLength, format: null };
            const lines = headerText.split('\n');
            let currentElement;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (line === '') continue;
                const lineValues = line.split(/\s+/);
                const lineType = lineValues.shift();
                line = lineValues.join(' ');
                switch (lineType) {
                    case 'format': header.format = lineValues[0]; break;
                    case 'comment': header.comments.push(line); break;
                    case 'element':
                        if (currentElement) header.elements.push(currentElement);
                        currentElement = { name: lineValues[0], count: parseInt(lineValues[1]), properties: [] };
                        break;
                    case 'property':
                        currentElement.properties.push(make_property(lineValues, header.format));
                        break;
                }
            }
            if (currentElement) header.elements.push(currentElement);
            return header;
        }
        function make_property(propertyValues, format) {
            const property = { type: propertyValues[0] };
            if (property.type === 'list') {
                property.name = propertyValues[3];
                property.countType = propertyValues[1];
                property.itemType = propertyValues[2];
            } else {
                property.name = propertyValues[1];
            }
            return property;
        }
        const geometry = new THREE.BufferGeometry();
        const header = parseHeader(data);
        const little_endian = header.format === 'binary_little_endian';
        const body = new DataView(data, header.headerLength);
        let offset = 0;
        
        const mapping = { x: 'x', y: 'y', z: 'z', nx: 'nx', ny: 'ny', nz: 'nz', red: 'red', green: 'green', blue: 'blue' };
        
        for (const element of header.elements) {
            const labels = {};
            const buffer = { indices: [] };
            // Mapeia propriedades para buffers
            for (const property of element.properties) {
                if (mapping[property.name]) labels[property.name] = [];
            }

            for (let i = 0; i < element.count; i++) {
                for (const property of element.properties) {
                    if (property.type === 'list') {
                        // Leitura segura de lista (faces)
                        const count = parseBinary(property.countType);
                        const indices = [];
                        for (let j = 0; j < count; j++) indices.push(parseBinary(property.itemType));
                        // Triangulação fã simples para polígonos
                        if (element.name === 'face') {
                            for (let j = 1; j < count - 1; j++) {
                                buffer.indices.push(indices[0], indices[j], indices[j + 1]);
                            }
                        }
                    } else {
                        const value = parseBinary(property.type);
                        if (labels[property.name]) labels[property.name].push(value);
                    }
                }
            }

            function parseBinary(type) {
                let val;
                switch (type) {
                    case 'int8': case 'char': val = body.getInt8(offset); offset += 1; break;
                    case 'uint8': case 'uchar': val = body.getUint8(offset); offset += 1; break;
                    case 'int16': case 'short': val = body.getInt16(offset, little_endian); offset += 2; break;
                    case 'uint16': case 'ushort': val = body.getUint16(offset, little_endian); offset += 2; break;
                    case 'int32': case 'int': val = body.getInt32(offset, little_endian); offset += 4; break;
                    case 'uint32': case 'uint': val = body.getUint32(offset, little_endian); offset += 4; break;
                    case 'float32': case 'float': val = body.getFloat32(offset, little_endian); offset += 4; break;
                    case 'float64': case 'double': val = body.getFloat64(offset, little_endian); offset += 8; break;
                }
                return val;
            }

            if (element.name === 'vertex') {
                if (labels.x) geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat(labels.x, labels.y, labels.z), 3));
                if (labels.nx) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(flat(labels.nx, labels.ny, labels.nz), 3));
                if (labels.red) {
                    const colors = [];
                    for(let k=0; k<labels.red.length; k++) colors.push(labels.red[k]/255, labels.green[k]/255, labels.blue[k]/255);
                    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                }
            } else if (element.name === 'face' && buffer.indices.length > 0) {
                geometry.setIndex(buffer.indices);
            }
        }
        function flat(x, y, z) { const a = []; for(let i=0; i<x.length; i++) a.push(x[i], y[i], z[i]); return a; }
        
        geometry.computeBoundingSphere();
        // Recalcula normais se não existirem
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        return geometry;
    }
}
THREE.PLYLoader = _PLYLoader;

// ---- STLLoader ----
class _STLLoader extends THREE.Loader {
    constructor(manager) { super(manager); }
    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setResponseType('arraybuffer');
        loader.load(url, data => onLoad(this.parse(data)), onProgress, onError);
    }
    parse(data) {
        const isBinary = (() => {
            const arr = new Uint8Array(data);
            // Check ASCII signature
            if (arr.length < 5) return false;
            const sig = String.fromCharCode(arr[0],arr[1],arr[2],arr[3],arr[4]);
            if (sig === 'solid') {
                // Might still be binary — check expected size
                const expected = 84 + (new DataView(data).getUint32(80,true)) * 50;
                if (expected === data.byteLength) return true;
                return false;
            }
            return true;
        })();
        const geometry = new THREE.BufferGeometry();
        const positions = [], normals = [];
        if (isBinary) {
            const view = new DataView(data);
            const nFaces = view.getUint32(80, true);
            let offset = 84;
            for (let f = 0; f < nFaces; f++) {
                const nx=view.getFloat32(offset,true), ny=view.getFloat32(offset+4,true), nz=view.getFloat32(offset+8,true);
                offset += 12;
                for (let v = 0; v < 3; v++) {
                    positions.push(view.getFloat32(offset,true), view.getFloat32(offset+4,true), view.getFloat32(offset+8,true));
                    normals.push(nx, ny, nz);
                    offset += 12;
                }
                offset += 2;
            }
        } else {
            const text = new TextDecoder().decode(data);
            const re = /facet normal ([^ ]+) ([^ ]+) ([^ ]+)[\s\S]*?vertex ([^ ]+) ([^ ]+) ([^ ]+)[\s\S]*?vertex ([^ ]+) ([^ ]+) ([^ ]+)[\s\S]*?vertex ([^ ]+) ([^ ]+) ([^ ]+)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const nx=parseFloat(m[1]), ny=parseFloat(m[2]), nz=parseFloat(m[3]);
                for (let i = 0; i < 3; i++) {
                    positions.push(parseFloat(m[4+i*3]), parseFloat(m[5+i*3]), parseFloat(m[6+i*3]));
                    normals.push(nx, ny, nz);
                }
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,3));
        return geometry;
    }
}
THREE.STLLoader = _STLLoader;

// ---- OBJLoader (simplificado) ----
class _OBJLoader extends THREE.Loader {
    constructor(manager) { super(manager); }
    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setPath(this.path);
        loader.load(url, text => onLoad(this.parse(text)), onProgress, onError);
    }
    parse(text) {
        const verts=[], norms=[], positions=[], normals2=[];
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (t.startsWith('v ')) { const p=t.split(/\s+/); verts.push(parseFloat(p[1]),parseFloat(p[2]),parseFloat(p[3])); }
            else if (t.startsWith('vn ')) { const p=t.split(/\s+/); norms.push(parseFloat(p[1]),parseFloat(p[2]),parseFloat(p[3])); }
            else if (t.startsWith('f ')) {
                const tris = t.substring(2).trim().split(/\s+/);
                for (let i = 1; i < tris.length-1; i++) {
                    for (const vi of [tris[0], tris[i], tris[i+1]]) {
                        const parts = vi.split('/');
                        const vi2 = (parseInt(parts[0])-1)*3;
                        positions.push(verts[vi2], verts[vi2+1], verts[vi2+2]);
                        if (parts[2] && norms.length) { const ni2=(parseInt(parts[2])-1)*3; normals2.push(norms[ni2],norms[ni2+1],norms[ni2+2]); }
                    }
                }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
        if (normals2.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals2,3));
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:0xe8d8b0, side:THREE.DoubleSide}));
        const group = new THREE.Group(); group.add(mesh); return group;
    }
}
THREE.OBJLoader = _OBJLoader;

})();
