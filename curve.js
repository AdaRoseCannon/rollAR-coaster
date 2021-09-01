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
const zeroVector3 = new THREE.Vector3(0, 0, 0);
const zAxis = new THREE.Vector3(0, 0, 1);

AFRAME.registerComponent('curve-point', {

	dependencies: ['position'],

	schema: {},

	init: function () {
		let el = this.el;
		while (el && el.matches && !el.matches('a-curve,[curve]')) el = el.parentNode;
		if (!el) throw Error('curve-points need to be inside a curve');
		this.parentCurve = el;
		this.oldPos = new THREE.Vector3();
	},

	update: function () {
		this.el.emit('point-change');
	},

	tick() {
		const worldPos = this.el.object3D.getWorldPosition(__tempPointA);
		if (this.oldPos.manhattanDistanceTo(worldPos) !== 0) {
			this.el.emit('point-shift');
		}
		this.oldPos.copy(worldPos);
	},

	remove: function () {
		this.el.emit('point-change');
	}

});

AFRAME.registerComponent('curve', {

	schema: {

		tension: {
			default: 0.25
		},

		closed: {
			default: false
		}
	},

	init () {
		this.onPointShift = this.onPointShift.bind(this);
		this.onChildRemove = this.onChildRemove.bind(this);
		this.update = this.update.bind(this);
		this.el.addEventListener('point-shift', this.onPointShift);
		this.el.addEventListener('point-change', this.update);
		this.observer = new MutationObserver(this.onChildRemove);
		this.observer.observe(this.el, {
			subtree: true,
			childList: true
		});
		this.points = new Map();
	},

	onChildRemove (mutationsList) {
		const els = Array.from(this.points.keys());
		for(const mutation of mutationsList) {
			for (const node of mutation.removedNodes) {
				if (els.includes(node)) {
					this.needsUpdate = true;
				}
			}
		}
	},

	onPointShift() {
		if (this.curve) {
			this.handlePointParents();
			this.curve.updateArcLengths();
			this.el.emit('curve-shift');
		}
	},

	update: function () {
		this.needsUpdate = true;
	},

	handlePointParents () {
		let hasReachedTop;
		for (const [el, position] of this.points) {
			const object = el.object3D;
			position.copy(object.position);
			hasReachedTop = false;
			object.traverseAncestors(parent => {
				if (parent === this.el.object3D) hasReachedTop = true;
				if (hasReachedTop) return;
				position.applyMatrix4(parent.matrix);
			});
		}
	},

	tick() {
		if (!this.needsUpdate) return;
		this.needsUpdate = false;

		this.points = new Map(
			Array.from(this.el.querySelectorAll('a-curve-point'))
			.filter(el => !!el.object3D)
			.map(el => {
				return [el, new THREE.Vector3()];
			})
		);

		this.handlePointParents();

		if (this.points.size <= 1) return;

		this.curve = new THREE.CatmullRomCurve3(Array.from(this.points.values()));

		this.curve.closed = this.data.closed;
		this.curve.tension = this.data.tension;
		
		this.curve.arcLengthDivisions = Math.ceil(this.curve.getLength()/0.01);
		this.curve.updateArcLengths();
		this.ready = true;

		this.el.emit('curve-updated');

		// Rotate each point object to line up with the curve
		for (const [{object3D: object}, pointPosition] of this.points) {
			const {
				tangent, position
			} = this.closestPointInLocalSpace(pointPosition);
			const targetPoint = tangent.multiplyScalar(0.4).add(position);

			// Get the unit vector from the object toward the target
			const lookAtPoint = __tempVector2.copy(targetPoint);
			const normal = __tempVector1.set(0,1,0).applyQuaternion(object.quaternion);
			nearestPointInPlane(position, normal, targetPoint, lookAtPoint);
			object.lookAt(lookAtPoint);
		}
	},

	remove () {
		this.curve = null;
		this.ready = false;
		this.observer.disconnect();
	},

	closestPointInLocalSpace (point, resolution) {
		const self = this;
		if (!this.ready) throw Error('Curve not instantiated yet.');
		resolution = resolution || 0.1 / this.curve.getLength();

		function binarySearch (testPoint, currentRes) {
			const aTest = (1 + testPoint + currentRes) % 1;
			const bTest = (1 + testPoint - currentRes) % 1;
			const a = self.curve.getPointAt(aTest, __tempPointA);
			const b = self.curve.getPointAt(bTest, __tempPointB);
			const aDistance = a.distanceTo(point);
			const bDistance = b.distanceTo(point);
			const aSmaller = aDistance < bDistance;
			if (currentRes < resolution) {

				const tangent = self.curve.getTangentAt(aSmaller ? aTest : bTest, __tempTangent);
				if (currentRes < resolution) return {
					result: aSmaller ? aTest : bTest,
					position: aSmaller ? a : b,
					distance: aSmaller ? aDistance : bDistance,
					normal: normalFromTangent(tangent, __tempVector1),
					tangent: tangent
				};
			}
			if (aDistance < bDistance) {
				return binarySearch(aTest, currentRes/2);
			} else {
				return binarySearch(bTest, currentRes/2);
			}
		}

		const samples = 20;
		const results = [];
		for (let i=0; i<=samples; i++) {
			const u = (i/samples) % 1;
			const linePoint = this.curve.getPointAt(u, __tempPointA);
			const distance = point.distanceTo(linePoint);
			results.push(distance);
		}
		const smallestDistance = results.reduce((a,b) => a<b?a:b);
		const u = results.indexOf(smallestDistance)/samples;
		return binarySearch(u, 1/samples);
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
		normal: { default: false },
		length: { default: 0.1 }
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
				const u = i/count;
				lineEnd = __tempVector1;
				lineEnd.copy(p);
				lineEnd.add(this.curve.curve.getTangentAt(u, __tempTangent).normalize().multiplyScalar(this.data.length));
				
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
				const u = i/count;
				lineEnd = normalFromTangent(
					this.curve.curve.getTangentAt(u, __tempTangent),
					__tempVector1
				).multiplyScalar(this.data.length);
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

function nearestPointInPlane(position, normal, p1, out) {
	const d = normal.dot(position);

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
		this.onPointShift = this.onPointShift.bind(this);
		this.update = this.update.bind(this);
		this.el.addEventListener('model-loaded', function (e) {
			// if the model is loaded for this element then update so it can be used
			// Don't trigger update for child elements models updating
			if (e.target === this.el) {
				this.update();
			}
		}.bind(this));
		this.pointShift = true;
	},

	update: function () {
		this.remove();
		if (this.data.curve) {
			this.curveEl = this.data.curve;
			this.curve = this.data.curve.components.curve;
			this.curveEl.addEventListener('curve-shift', this.onPointShift);
			this.curveEl.addEventListener('curve-updated', this.update);
		} else if (this.el.components.curve) {
			this.curveEl = this.el;
			this.curve = this.el.components.curve;
			this.curveEl.addEventListener('curve-shift', this.onPointShift);
			this.curveEl.addEventListener('curve-updated', this.update);
		}
	},

	onPointShift: function () {
		this.pointShift = true;
		const clones = this.el.getObject3D('clones');
		if (clones) {
			const cloneCount = clones.children[0].instanceMatrix.count;
			const length = this.curve.curve.getLength();
			const count = Math.ceil(length/this.data.spacing);

			// If the new needed amount needs more than 5% more pieces then regenerate the isntanced mesh
			if (count > Math.floor(cloneCount * 1.05)) {
				this.update();
			}
		}
	},

	tick() {
		const mesh = this.el.getObject3D('mesh');
		if (mesh) {
			let clones = this.el.getObject3D('clones');
			const length = this.curve.curve.getLength();
			const count = Math.ceil(length/this.data.spacing);

			if (!clones && this.curve) {

				mesh.visible = false;
				clones =  new THREE.Group();
				this.el.setObject3D('clones', clones);
				mesh.traverse(function (obj) {
					if (obj.geometry) {
						const geometry = obj.geometry.clone();
						geometry.applyMatrix4(obj.matrix);
						const mesh = new THREE.InstancedMesh(geometry, obj.material, count);
						mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
						clones.add(mesh);
					}
				});
				this.pointShift = true;
			}

			// reposition points
			if (this.pointShift) {
				const cloneCount = clones.children[0].instanceMatrix.count;
				for (let i=0;i<cloneCount;i++) {
					if (i>count) {
						// Hide excess clone pieces
						__tempMatrix4.compose(
							zeroVector3,
							__tempQuaternion,
							zeroVector3
						);
						for (const instance of clones.children) {
							instance.setMatrixAt(i,__tempMatrix4);
						}
					} else {
	
						// handle when there aren't enough clone pieces
						const u = i/Math.min(count, cloneCount);
						const tangent = this.curve.curve.getTangentAt(u, __tempTangent);
						__tempMatrix4.compose(
							this.curve.curve.getPointAt(u, __tempPointA),
							__tempQuaternion.setFromUnitVectors(zAxis, tangent),
							this.data.scale
						);
						for (const instance of clones.children) {
							instance.setMatrixAt(i,__tempMatrix4);
						}
					}
				}
				for (const instance of clones.children) {
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
		tension: 'curve.tension'
	}

});

}());
