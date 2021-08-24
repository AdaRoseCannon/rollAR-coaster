/* jshint esversion: 9 */
/* For dealing with spline curves */
/* global THREE, AFRAME */
(function () {
	"use strict";

	const sceneEl = document.querySelector('a-scene');
	const curveEl = document.querySelector('a-curve');
	const domOverlayEl = document.getElementById('dom-overlay');
	const message = document.getElementById('dom-overlay-message');
	const cart = document.getElementById('cart');
	const endPoint = document.getElementById('end-point');
	const endPointCircle = endPoint.firstElementChild;
	const waypointStack = [];
	const __tempVec1 = new THREE.Vector3();
	const __tempVec2 = new THREE.Vector3();
	
	let pointNo = 0;

	function hitTestSelect () {
		const lastPlacedPoint = sceneEl.getAttribute('ar-hit-test').target;
		const endPointPosition = endPoint.object3D.getWorldPosition(__tempVec1);
		const lastPointPosition = lastPlacedPoint.object3D.getWorldPosition(__tempVec2);
		if (
			endPointPosition.distanceTo(lastPointPosition) < 0.3
		) {
			message.innerHTML = '';
			lastPlacedPoint.remove();
			curveEl.setAttribute('closed',  true);
			sceneEl.setAttribute('ar-hit-test', 'enabled', false);
			endPointCircle.setAttribute('visible', false);
			cart.components['roller-coaster'].t = 0;
			cart.components['roller-coaster'].speed = 0;
			cart.setAttribute('visible', true);
		}
	}

	sceneEl.addEventListener('exit-vr', function () {
		this.setAttribute('ar-hit-test', 'enabled', true);
	});

	sceneEl.addEventListener('enter-vr', function () {
		if (this.is('ar-mode')) {
			message.textContent = '';
			endPointCircle.setAttribute('visible', true);

			curveEl.setAttribute('closed',  false);
			for (const el of document.querySelectorAll('.sample')) {
				el.remove();
			}

			this.addEventListener('ar-hit-test-start', function () {
				message.innerHTML = `Scanning environment, finding surface.`;
			}, { once: true });

			this.addEventListener('ar-hit-test-achieved', function () {
				message.innerHTML = `Select the location to place the station<br />By tapping on the screen or selecting with your controller.`;
			}, { once: true });

			const nextFn = function () {
				const lastPlacedPoint = this.getAttribute('ar-hit-test').target;
				const id = 'point-' + pointNo++;
				const el = document.createElement('a-curve-point');
				const p = lastPlacedPoint.object3D.position;
				el.setAttribute('gltf-model', "#flag-glb");
				el.setAttribute('position', `${p.x} ${p.y} ${p.z+0.2}`);
				el.setAttribute('scale', `0.4 0.4 0.4`);
				el.id=id;
				curveEl.appendChild(el);
				this.setAttribute('ar-hit-test', 'target', '#' + id);
				waypointStack.push(el);
			}.bind(this);

			const undoFn = function () {
				if (waypointStack.length === 0) {
					message.innerHTML = `Select the location to place the station<br />By tapping on the screen or selecting with your controller.`;
					this.setAttribute('ar-hit-test', 'target', '#station');
					this.addEventListener('ar-hit-test-select', placeStation, {once: true});
				} else {
					waypointStack.pop().remove();
				}
			}.bind(this);

			const placeStation = function placeStation() {
				this.addEventListener('ar-hit-test-select', hitTestSelect);
				curveEl.setAttribute('visible', true);
				message.innerHTML = `Place some way-points for the roller coaster track when you are finished join the track back up to the station.`;
				
				const buttons = document.createElement('div');
				message.appendChild(buttons);
	
				const undo = document.createElement('button');
				undo.textContent = 'Undo';
				undo.addEventListener('click', undoFn);
				buttons.appendChild(undo);
	
				const next = document.createElement('button');
				next.textContent = 'Next';
				next.addEventListener('click', nextFn);
				buttons.appendChild(next);
				nextFn();

				buttons.addEventListener('beforexrselect', e => {
					e.preventDefault();
				});
			};
			this.addEventListener('ar-hit-test-select', placeStation , {once: true});
		}
	});

	sceneEl.addEventListener('exit-vr', function () {
		message.textContent = '';
	});

}());
