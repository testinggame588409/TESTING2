var ongoingTouches = [];
var joystickTouchId = null;
var joystickBaseX = 0;
var joystickBaseY = 0;
var joystickDeltaX = 0;
var joystickActive = false;


function copyTouch({ identifier, pageX, pageY }) {
  return { identifier, pageX, pageY };
}

function ongoingTouchIndexById ( idToFind ) {
		for (var i = 0; i < ongoingTouches.length; i++) {
			var id = ongoingTouches[i].identifier;
			if ( id == idToFind ) { return i; }
		}
		return -1;    // not found
	}

class TouchControl
{
	constructor(canvasTarget) // e.g. canvasTarget = document.getElementById("canvas")
	{
		this.target = canvasTarget;
		canvasTarget.addEventListener("touchstart", this.handleStart, false);
		canvasTarget.addEventListener("touchend", this.handleEnd, false);
		canvasTarget.addEventListener("touchcancel", this.handleCancel, false);
		canvasTarget.addEventListener("touchmove", this.handleMove, false);

		// Initialize joystick
		this.initJoystick();
	}

	initJoystick() {
		var joystickStick = document.getElementById('joystickStick');
		var joystickContainer = document.getElementById('joystickContainer');

		if (!joystickStick || !joystickContainer) return;

		var baseRect = joystickContainer.querySelector('.joystick-base').getBoundingClientRect();
		joystickBaseX = baseRect.left + baseRect.width / 2;
		joystickBaseY = baseRect.top + baseRect.height / 2;

		// Joystick touch handlers
		// 注意：移除 stopPropagation，允許其他元素（如 XP BOX）同時接收觸控
		joystickStick.addEventListener('touchstart', function(e) {
			e.preventDefault(); // 防止滾動頁面
			// 不要 stopPropagation，允許多點觸控
			var touch = e.changedTouches[0];
			joystickTouchId = touch.identifier;
			joystickActive = true;
			updateJoystickPosition(touch.pageX, touch.pageY);
		}, {passive: false});

		joystickStick.addEventListener('touchmove', function(e) {
			e.preventDefault();
			for (var i = 0; i < e.changedTouches.length; i++) {
				if (e.changedTouches[i].identifier === joystickTouchId) {
					updateJoystickPosition(e.changedTouches[i].pageX, e.changedTouches[i].pageY);
					break;
				}
			}
		}, {passive: false});

		joystickStick.addEventListener('touchend', function(e) {
			for (var i = 0; i < e.changedTouches.length; i++) {
				if (e.changedTouches[i].identifier === joystickTouchId) {
					resetJoystick();
					break;
				}
			}
		}, false);

		joystickStick.addEventListener('touchcancel', function(e) {
			resetJoystick();
		}, false);

		// Base touch handlers for joystick container
		joystickContainer.addEventListener('touchstart', function(e) {
			e.preventDefault();
			var touch = e.changedTouches[0];
			joystickTouchId = touch.identifier;
			joystickActive = true;
			updateJoystickPosition(touch.pageX, touch.pageY);
		}, {passive: false});

		joystickContainer.addEventListener('touchmove', function(e) {
			e.preventDefault();
			for (var i = 0; i < e.changedTouches.length; i++) {
				if (e.changedTouches[i].identifier === joystickTouchId) {
					updateJoystickPosition(e.changedTouches[i].pageX, e.changedTouches[i].pageY);
					break;
				}
			}
		}, {passive: false});

		joystickContainer.addEventListener('touchend', function(e) {
			resetJoystick();
		}, false);

		joystickContainer.addEventListener('touchcancel', function(e) {
			resetJoystick();
		}, false);
	}

	update ()
	{
		// Check if joystick is active
		if (joystickActive && currentState === GameState.PLAYING) {
			// Apply joystick input to game controls
			var threshold = 20; // Minimum movement threshold
			if (Math.abs(joystickDeltaX) > threshold) {
				if (joystickDeltaX < 0) {
					keyLeft = true;
					keyRight = false;
				} else {
					keyLeft = false;
					keyRight = true;
				}
				keyFaster = true; // Auto-accelerate when using joystick
				keySlower = false;
			} else {
				keyLeft = false;
				keyRight = false;
				keyFaster = true; // Still auto-accelerate
				keySlower = false;
			}
		}
	}

	handleStart(e)
	{
		e.preventDefault();
		var touches = e.changedTouches;

		for (var i = 0; i < touches.length; i++)
		{
			ongoingTouches.push(copyTouch(touches[i]));
		}
	} // end handle touch-start

	handleMove(e)
	{
		e.preventDefault();
		var touches = e.changedTouches;

		for (var i = 0; i < touches.length; i++)
		{
			var idx = ongoingTouchIndexById(touches[i].identifier);

			if (idx >= 0)
			{
				ongoingTouches.splice(idx, 1, copyTouch(touches[i]));  // swap in the new touch record
			}
			else
			{
				console.log("can't figure out which touch to continue");
			}
		}
	} // end handle touch-move

	handleEnd(e)
	{
		e.preventDefault();
		var touches = e.changedTouches;

		for (var i = 0; i < touches.length; i++)
		{
			//console.log ( "ended touch: (" + touches[i].pageX + ", " + touches[i].pageY + ") " );

			var idx = ongoingTouchIndexById(touches[i].identifier);

			if (idx >= 0)
			{
				ongoingTouches.splice(idx, 1);  // remove it; we're done
			}
			else
			{
				console.log("can't figure out which touch to end");
			}
		}
	} // end handle touch-end

	handleCancel(e)
	{
		e.preventDefault();
		var touches = e.changedTouches;

		for (var i = 0; i < touches.length; i++)
		{
			var idx = ongoingTouchIndexById(touches[i].identifier);
			ongoingTouches.splice(idx, 1);  // remove it; we're done
		}
	} // end handle touch-cancel
}

function updateJoystickPosition(touchX, touchY) {
	var joystickStick = document.getElementById('joystickStick');
	if (!joystickStick) return;

	var maxDistance = 45; // Maximum stick movement radius

	// Calculate delta
	joystickDeltaX = touchX - joystickBaseX;
	var joystickDeltaY = touchY - joystickBaseY;

	// Limit to circular area
	var distance = Math.sqrt(joystickDeltaX * joystickDeltaX + joystickDeltaY * joystickDeltaY);
	if (distance > maxDistance) {
		joystickDeltaX = (joystickDeltaX / distance) * maxDistance;
		joystickDeltaY = (joystickDeltaY / distance) * maxDistance;
	}

	// Update stick visual position
	joystickStick.style.transform = 'translate(calc(-50% + ' + joystickDeltaX + 'px), calc(-50% + ' + joystickDeltaY + 'px))';
}

function resetJoystick() {
	var joystickStick = document.getElementById('joystickStick');
	if (joystickStick) {
		joystickStick.style.transform = 'translate(-50%, -50%)';
	}
	joystickDeltaX = 0;
	joystickActive = false;
	joystickTouchId = null;
}

