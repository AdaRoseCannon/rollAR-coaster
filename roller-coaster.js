/* global THREE, AFRAME */
/* jshint esversion: 9 */
(function () {
"use strict";

const __zAxis = new THREE.Vector3(0, 0, 1);
const __tempTangent = new THREE.Vector3();
const __tempPoint = new THREE.Vector3();
const __tempQuaternion = new THREE.Quaternion();

AFRAME.registerComponent('roller-coaster', {
	schema: {
		curve: {
			type: 'selector'
		},
		spacing: {
			default: 0.25
		}
	},
	init() {
		this.update = this.update.bind(this);
		this.data.curve.addEventListener('curve-update', this.update);
		this.t = 0;
	},
	update() {
		this.curve = null;
		this.speed = 5;
	},
	tick(time, delta) {
		delta = Math.min(delta, 100);
		const mesh = this.el.getObject3D('mesh');
		const count = 5;
		const terminalVelocity = this.data.spacing/5;
		const minSpeed = 0.005;
		const timeMultiplier = delta/16;

		if (!mesh) return;

		if (!this.el.getObject3D('clones')) {
			const cloneMesh =  new THREE.Group();
			this.el.setObject3D('clones', cloneMesh);
			this.meshes = [mesh];
			mesh.matrixAutoUpdate = false;
			for (let i=0;i<count-1;i++) {
				const clonedMesh = mesh.clone(true);
				this.meshes.unshift(clonedMesh);
				cloneMesh.add(clonedMesh);
			}
		}

		if (!this.curve) {
			this.curve = this.data.curve.components.curve;
			this.curveLength = this.curve.curve.getLength();
		}
		const speed = Math.max(this.speed, minSpeed);
		const distanceToTravel = timeMultiplier * speed / this.curveLength;
		this.t += distanceToTravel;
		if (this.t >= 1) this.t -= 1;

		const iOffset = -Math.floor(count/2);
		for (let i=iOffset;i<count+iOffset;i++) {
			const dT = i * this.data.spacing/this.curveLength;
			const t = (1 + this.t + dT) % 1;

			const tangent = this.curve.curve.getTangentAt(t, __tempTangent).normalize();
			this.meshes[i-iOffset].matrix.compose(
				this.curve.curve.getPointAt(t, __tempPoint).divide(this.el.object3D.scale),
				__tempQuaternion.setFromUnitVectors(__zAxis, tangent),
				this.el.object3D.scale
			);
			if (i-iOffset === 0) {
				// gravity accelaration, limit the top speed by the terminal velocity and rate of decleration to prevent sudden slow downs
				this.speed = Math.min(speed + Math.max(-0.133 * distanceToTravel, 0.5 * -9.8 * distanceToTravel * tangent.y), terminalVelocity);
				this.speed *= 1 - delta * 0.0001; // friction
			}
		}
	}
});

}());
