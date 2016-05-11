import * as macro from '../../../macro';

// ----------------------------------------------------------------------------
// vtkSphereSource methods
// ----------------------------------------------------------------------------

export function sphereSource(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkSphereSource');

  function update() {
    if (model.deleted) {
      return;
    }

    let dataset = model.output[0];
    if (!dataset || dataset.mtime !== model.mtime) {
      const state = {};
      dataset = {
        type: 'PolyData',
        mtime: model.mtime,
        metadata: {
          source: 'SphereSource',
          state,
        },
        PolyData: {
          Points: {
            type: 'DataArray',
            name: '_points',
            tuple: 3,
            dataType: model.pointType,
          },
          Cells: {
            Polys: {
              type: 'DataArray',
              name: '_polys',
              tuple: 1,
              dataType: 'Uint32Array',
            },
          },
          PointData: {
            Normals: {
              type: 'DataArray',
              name: 'Normals',
              tuple: 3,
              dataType: 'Float32Array',
            },
          },
        },
      };

      // Add parameter used to create dataset as metadata.state[*]
      ['radius', 'latLongTessellation', 'thetaResolution', 'startTheta', 'endTheta', 'phiResolution', 'startPhi', 'endPhi'].forEach(field => {
        state[field] = model[field];
      });
      ['center'].forEach(field => {
        state[field] = [].concat(model[field]);
      });

      // ----------------------------------------------------------------------
      let numPoles = 0;
      const deltaTheta = (model.endTheta - model.startTheta) / model.thetaResolution;
      const numPts = model.phiResolution * model.thetaResolution + 2;
      const numPolys = model.phiResolution * 2 * model.thetaResolution;

      // Points
      let pointIdx = 0;
      let points = new window[dataset.PolyData.Points.dataType](numPts * 3);
      dataset.PolyData.Points.values = points;
      dataset.PolyData.Points.size = numPts * 3;

      // Normals
      let normals = new Float32Array(numPts * 3);
      dataset.PolyData.PointData.Normals.values = normals;
      dataset.PolyData.PointData.Normals.size = numPts * 3;

      // Cells
      let cellLocation = 0;
      let polys = new window[dataset.PolyData.Cells.Polys.dataType](numPolys * 5); // FIXME array size
      dataset.PolyData.Cells.Polys.values = polys;

      // Create north pole if needed
      if (model.startPhi <= 0.0) {
        points[pointIdx * 3 + 0] = model.center[0];
        points[pointIdx * 3 + 1] = model.center[1];
        points[pointIdx * 3 + 2] = model.center[2] + model.radius;

        normals[pointIdx * 3 + 0] = 0;
        normals[pointIdx * 3 + 1] = 0;
        normals[pointIdx * 3 + 2] = 1;

        pointIdx++;
        numPoles++;
      }

      // Create south pole if needed
      if (model.endPhi >= 180.0) {
        points[pointIdx * 3 + 0] = model.center[0];
        points[pointIdx * 3 + 1] = model.center[1];
        points[pointIdx * 3 + 2] = model.center[2] - model.radius;

        normals[pointIdx * 3 + 0] = 0;
        normals[pointIdx * 3 + 1] = 0;
        normals[pointIdx * 3 + 2] = -1;

        pointIdx++;
        numPoles++;
      }

      // Check data, determine increments, and convert to radians
      let thetaResolution = model.thetaResolution;
      let startTheta = (model.startTheta < model.endTheta ? model.startTheta : model.endTheta);
      startTheta *= Math.PI / 180.0;
      let endTheta = (model.endTheta > model.startTheta ? model.endTheta : model.startTheta);
      endTheta *= Math.PI / 180.0;

      let startPhi = (model.startPhi < model.endPhi ? model.startPhi : model.endPhi);
      startPhi *= Math.PI / 180.0;
      let endPhi = (model.endPhi > model.startPhi ? model.endPhi : model.startPhi);
      endPhi *= Math.PI / 180.0;

      const phiResolution = model.phiResolution - numPoles;
      const deltaPhi = (endPhi - startPhi) / (model.phiResolution - 1);

      if (Math.abs(startTheta - endTheta) < 360.0) {
        ++thetaResolution;
      }

      const jStart = (model.startPhi <= 0.0 ? 1 : 0);
      const jEnd = model.phiResolution + (model.endPhi >= 180.0 ? -1 : 0);

      // Create intermediate points
      for (let i = 0; i < thetaResolution; i++) {
        const theta = startTheta * Math.PI / 180.0 + i * deltaTheta;
        for (let j = jStart; j < jEnd; j++) {
          const phi = startPhi + j * deltaPhi;
          const radius = model.radius * Math.sin(phi);

          normals[pointIdx * 3 + 0] = radius * Math.cos(theta);
          normals[pointIdx * 3 + 1] = radius * Math.sin(theta);
          normals[pointIdx * 3 + 2] = model.radius * Math.cos(phi);

          points[pointIdx * 3 + 0] = normals[pointIdx * 3 + 0] + model.center[0];
          points[pointIdx * 3 + 1] = normals[pointIdx * 3 + 1] + model.center[1];
          points[pointIdx * 3 + 2] = normals[pointIdx * 3 + 2] + model.center[2];

          let norm = Math.sqrt(
            normals[pointIdx * 3 + 0] * normals[pointIdx * 3 + 0] +
            normals[pointIdx * 3 + 1] * normals[pointIdx * 3 + 1] +
            normals[pointIdx * 3 + 2] * normals[pointIdx * 3 + 2]);

          norm = (norm === 0) ? 1 : norm;
          normals[pointIdx * 3 + 0] /= norm;
          normals[pointIdx * 3 + 1] /= norm;
          normals[pointIdx * 3 + 2] /= norm;

          pointIdx++;
        }
      }

      // Generate mesh connectivity
      const base = phiResolution * thetaResolution;

      if (Math.abs(startTheta - endTheta) < 360.0) {
        --thetaResolution;
      }

      // around north pole
      if (model.startPhi <= 0.0) {
        for (let i = 0; i < thetaResolution; i++) {
          polys[cellLocation++] = 3;
          polys[cellLocation++] = phiResolution * i + numPoles;
          polys[cellLocation++] = (phiResolution * (i + 1) % base) + numPoles;
          polys[cellLocation++] = 0;
        }
      }

      // around south pole
      if (model.endPhi >= 180.0) {
        const numOffset = phiResolution - 1 + numPoles;

        for (let i = 0; i < thetaResolution; i++) {
          polys[cellLocation++] = 3;
          polys[cellLocation++] = phiResolution * i + numOffset;
          polys[cellLocation++] = ((phiResolution * (i + 1)) % base) + numOffset;
          polys[cellLocation++] = numPoles - 1;
        }
      }

      // bands in-between poles
      for (let i = 0; i < thetaResolution; i++) {
        for (let j = 0; j < (phiResolution - 1); j++) {
          const a = phiResolution * i + j + numPoles;
          const b = points[pointIdx * 3 + 0] + 1;
          const c = ((phiResolution * (i + 1) + j) % base) + numPoles + 1;

          if (!model.latLongTessellation) {
            polys[cellLocation++] = 3;
            polys[cellLocation++] = a;
            polys[cellLocation++] = b;
            polys[cellLocation++] = c;
            polys[cellLocation++] = 3;
            polys[cellLocation++] = a;
            polys[cellLocation++] = c;
            polys[cellLocation++] = c - 1;
          } else {
            polys[cellLocation++] = 4;
            polys[cellLocation++] = a;
            polys[cellLocation++] = b;
            polys[cellLocation++] = c;
            polys[cellLocation++] = c - 1;
          }
        }
      }

      // Squeeze
      points = points.subarray(0, pointIdx * 3);
      dataset.PolyData.Points.values = points;
      dataset.PolyData.Points.size = pointIdx * 3;

      normals = normals.subarray(0, pointIdx * 3);
      dataset.PolyData.PointData.Normals.values = normals;
      dataset.PolyData.PointData.Normals.size = pointIdx * 3;

      polys = polys.subarray(0, cellLocation);
      dataset.PolyData.Cells.Polys.values = polys;
      dataset.PolyData.Cells.Polys.size = cellLocation;

      // Update output
      model.output[0] = dataset;
    }
  }

  // Expose methods
  publicAPI.update = update;
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  radius: 0.5,
  latLongTessellation: false,
  thetaResolution: 8,
  startTheta: 0.0,
  endTheta: 360.0,
  phiResolution: 8,
  startPhi: 0.0,
  endPhi: 360.0,
  center: [0, 0, 0],
  pointType: 'Float32Array',
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Build VTK API
  macro.obj(publicAPI, model);
  macro.setGet(publicAPI, model, [
    'radius',
    'latLongTessellation',
    'thetaResolution',
    'startTheta',
    'endTheta',
    'phiResolution',
    'startPhi',
    'endPhi',
  ]);
  macro.setGetArray(publicAPI, model, ['center'], 3);
  macro.algo(publicAPI, model, 0, 1);
  sphereSource(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
