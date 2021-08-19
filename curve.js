/* jshint esversion: 9 */
/* For dealing with spline curves */
/* global THREE, AFRAME */
(function () {
"use strict";

const __tempVector1 = new THREE.Vector3();
const __tempVector2 = new THREE.Vector3();
const __tempTangent = new THREE.Vector3();
const __tempPointA = new THREE.Vector3();
const __tempPointB = new THREE.Vector3();
const __tempMatrix4 = new THREE.Matrix4();
const __tempQuaternion = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const degToRad = THREE.Math.degToRad;

AFRAME.registerComponent('curve-point', {

	dependencies: ['position'],

	schema: {},

	init: function () {
		let el = this.el;
		while (el && el.matches && !el.matches('a-curve,[curve]')) el = el.parentNode;
		if (!el) throw Error('curve-points need to be inside a curve');
		this.parentCurve = el;
	},

	update: function () {
		this.parentCurve.updateComponent('curve');
	},

	remove: function () {
		this.update();
	}

});

AFRAME.registerComponent('curve', {

	schema: {

		// CatmullRom
		// Spline
		// CubicBezier
		// QuadraticBezier
		// Line
		type: {
			default: 'CatmullRom'
		},

		closed: {
			default: false
		}
	},

	update: function () {
		this.needsUpdate = true;
	},

	tick: function () {
		if (!this.needsUpdate) return;
		this.needsUpdate = false;

		const pointObjects = Array.from(
			this.el.querySelectorAll('a-curve-point')
		).map(el => el.object3D)
		.filter(obj => !!obj);

		if (pointObjects.length <= 1) return;

		const threeConstructor =  THREE[this.data.type + 'Curve3'];
		if (!threeConstructor) {
			this.pause();
			throw ('No Three constructor of type (case sensitive): ' + this.data.type + 'Curve3');
		}
		this.curve = new threeConstructor(
			pointObjects.map(function (a) {
				if (a.position.x !== undefined && a.position.y !== undefined && a.position.z !== undefined) {
					return a.position;
				}
			})
		);

		if (this.data.type === 'CatmullRom') {
			pointObjects.forEach((object, i) => {
				const t = i/(pointObjects.length - 1);
				const targetPoint = this.curve.getTangentAt(t, __tempTangent);
				targetPoint.normalize();
				targetPoint.add(object.position);

				// Get the unit vector from the object toward the target
				nearestPointInPlane(object, targetPoint, __tempVector2);
				__tempVector2.sub(object.position);
				__tempVector2.normalize();

				// Get the vector the object is currently facing
				const objectDirection = __tempVector1.set(0,0,-1).applyQuaternion(object.quaternion);

				// Get the quaternion that maps one to the other
				const rotation = __tempQuaternion.setFromUnitVectors(objectDirection, __tempVector2);

				// Apply that quaternion
				object.quaternion.premultiply(rotation);
			});
			this.curve.closed = this.data.closed;
		}
		
		this.curve.arcLengthDivisions = Math.ceil(this.curve.getLength()/0.01);
		this.curve.updateArcLengths();

		this.el.emit('curve-updated');

		this.ready = true;
	},

	remove: function () {
		this.curve = null;
		this.ready = false;
	},

	closestPointInLocalSpace: function closestPoint(point, resolution, testPoint, currentRes) {
		if (!this.ready) throw Error('Curve not instantiated yet.');
		resolution = resolution || 0.1 / this.curve.getLength();
		currentRes = currentRes || 0.5;
		testPoint = testPoint || 0.5;
		currentRes /= 2;
		const aTest = testPoint + currentRes;
		const bTest = testPoint - currentRes;
		const a = this.curve.getPointAt(aTest, __tempPointA);
		const b = this.curve.getPointAt(bTest, __tempPointB);
		const aDistance = a.distanceTo(point);
		const bDistance = b.distanceTo(point);
		const aSmaller = aDistance < bDistance;
		if (currentRes < resolution) {

			const tangent = this.curve.getTangentAt(aSmaller ? aTest : bTest, __tempTangent);
			if (currentRes < resolution) return {
				result: aSmaller ? aTest : bTest,
				location: aSmaller ? a : b,
				distance: aSmaller ? aDistance : bDistance,
				normal: normalFromTangent(tangent, __tempVector1),
				tangent: tangent
			};
		}
		if (aDistance < bDistance) {
			return this.closestPointInLocalSpace(point, resolution, aTest, currentRes);
		} else {
			return this.closestPointInLocalSpace(point, resolution, bTest, currentRes);
		}
	}
});


const tempQuaternion = new THREE.Quaternion();
function normalFromTangent(tangent, outVec) {
	outVec.set(0, 1, 0);
	const lineEnd = outVec;
	tempQuaternion.setFromUnitVectors(zAxis, tangent);
	lineEnd.applyQuaternion(tempQuaternion);
	return lineEnd;
}

AFRAME.registerComponent('draw-curve', {

	dependencies: ['curve', 'material'],

	schema: {
		curve: { type: 'selector' },
		spacing: { default: 0.5 },
		tangent: { default: false },
		normal: { default: false }
	},

	init: function () {
		this.el.addEventListener('curve-updated', this.update.bind(this));
	},

	update: function () {
		if (this.data.curve) {
			this.curve = this.data.curve.components.curve;
		} else if (this.el.components.curve.curve) {
			this.curve = this.el.components.curve;
		}

		if (!this.curve) return;

		if (this.curve.curve) {

			const length = this.curve.curve.getLength();
			const count = Math.ceil(length/this.data.spacing);

			let lineEnd;
			let tangentGeometry;
			let normalGeometry;

			const mesh = new THREE.Line(
				new THREE.BufferGeometry(), 
				new THREE.LineBasicMaterial({
					color: 'red'
				})
			);
			this.el.setObject3D('line', mesh);

			const points = this.curve.curve.getSpacedPoints(count);
			mesh.geometry.setFromPoints(points);

			// Generate normals and tangents for each point
			if (this.data.tangent) points.forEach((p,i) => {
				const proportionAlong = i/count;
				const t = this.curve.curve.getUtoTmapping( proportionAlong );
				lineEnd = __tempVector1;
				lineEnd.copy(p);
				lineEnd.add(this.curve.curve.getTangent(t, __tempTangent).normalize());
				
				tangentGeometry = new THREE.BufferGeometry().setFromPoints([
					p,lineEnd
				]);

				mesh.add(new THREE.Line(
					tangentGeometry,
					new THREE.LineBasicMaterial({
						color: 'green'
					})
				));
			});


			if (this.data.normal) points.forEach((p,i) => {
				const proportionAlong = i/count;
				const t = this.curve.curve.getUtoTmapping( proportionAlong );
				lineEnd = normalFromTangent(
					this.curve.curve.getTangent(t, __tempTangent).normalize(),
					__tempVector1
				);
				lineEnd.add(p);

				normalGeometry = new THREE.BufferGeometry().setFromPoints([
					p, lineEnd
				]);

				mesh.add(new THREE.Line(
					normalGeometry,
					new THREE.LineBasicMaterial({
						color: 'white'
					})
				));
			});
		}
	},

	remove: function () {

		this.el.getObject3D('mesh').geometry = new THREE.Geometry();
	}

});

function nearestPointInPlane(object, p1, out) {
	const normal = __tempVector1.set(0,1,0)
	  .applyQuaternion(object.quaternion);
	const d = normal.dot(object.position);

	// distance of point from plane
	const t = (d - normal.dot(p1))/normal.length();

	// closest point on the plane
	out.copy(normal);
	out.multiplyScalar(t);
	out.add(p1);
	return out;
}

AFRAME.registerComponent('clone-along-curve', {

	dependencies: ['curve'],

	schema: {
		curve: { type: 'selector' },
		spacing: { default: 1 },
		scale: {
			type: 'vec3',
			default: {x:1,y:1,z:1}
		}
	},

	init: function () {
		this.el.addEventListener('model-loaded', this.update.bind(this));
		this.el.addEventListener('curve-updated', this.update.bind(this));
	},

	update: function () {
		this.remove();
		if (this.data.curve) {
			this.curve = this.data.curve.components.curve;
		} else if (this.el.components.curve.curve) {
			this.curve = this.el.components.curve;
		}
	},

	tick: function () {
		const mesh = this.el.getObject3D('mesh');
		if (mesh && !this.el.getObject3D('clones') && this.curve) {

			mesh.visible = false;
			const length = this.curve.curve.getLength();
			const count = Math.ceil(length/this.data.spacing);
			const cloneMesh =  new THREE.Group();
			this.el.setObject3D('clones', cloneMesh);
			const meshes = [];
			mesh.traverse(function (obj) {
				if (obj.geometry) {
					const geometry = obj.geometry.clone();
					geometry.applyMatrix4(obj.matrix);
					const mesh = new THREE.InstancedMesh(geometry, obj.material, count);
					meshes.push(mesh);
					cloneMesh.add(mesh);
				}
			});

			for (let i=0;i<count;i++) {
				const proportionAlong = i/count;
				const t = this.curve.curve.getUtoTmapping( proportionAlong );
				const tangent = this.curve.curve.getTangent(t, __tempTangent).normalize();
				__tempMatrix4.compose(
					this.curve.curve.getPoint(t, __tempPointA),
					__tempQuaternion.setFromUnitVectors(zAxis, tangent),
					this.data.scale
				);
				for (const instance of meshes) {
					instance.setMatrixAt(i,__tempMatrix4);
					instance.instanceMatrix.needsUpdate = true;
				}
			}
		}
	},

	remove: function () {
		this.curve = null;
		const clones = this.el.getObject3D('clones');
		if (clones) {
			clones.children.forEach(child => child.dispose());
			this.el.removeObject3D('clones');
		}
	}

});

AFRAME.registerPrimitive('a-draw-curve', {
	defaultComponents: {
		'draw-curve': {}
	},
	mappings: {
		curve: 'draw-curve.curve'
	}
});

AFRAME.registerPrimitive('a-curve-point', {
	defaultComponents: {
		'curve-point': {}
	}
});


AFRAME.registerPrimitive('a-curve', {

	defaultComponents: {
		'curve': {}
	},
	mappings: {
		closed: 'curve.closed',
	}

});

}());
