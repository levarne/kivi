goog.provide('kivi.scheduler.Scheduler');
goog.provide('kivi.scheduler.SchedulerFlags');
goog.provide('kivi.scheduler.instance');
goog.require('kivi.scheduler.Frame');
goog.require('kivi.scheduler.FrameFlags');
goog.require('kivi.scheduler.MutationObserver');
goog.require('kivi.scheduler.PostMessage');

/**
 * Scheduler Flags.
 *
 * @enum {number}
 */
kivi.scheduler.SchedulerFlags = {
  RUNNING:           0x0100,
  MICROTASK_PENDING: 0x0001,
  MACROTASK_PENDING: 0x0002,
  FRAMETASK_PENDING: 0x0008,
  MICROTASK_RUNNING: 0x0010,
  MACROTASK_RUNNING: 0x0020,
  FRAMETASK_RUNNING: 0x0080
};

/**
 * Scheduler.
 *
 * Scheduler supports animation frame tasks, and simple microtasks.
 *
 * Animation frame tasks will be executed in batches, switching between write and read tasks until there
 * are no tasks left. Write tasks are sorted by their priority, tasks with the lowest priority value are
 * executed first, so the lowest depth of the Component in the components tree has highest priority.
 *
 * Scheduler also have monotonically increasing internal clock, it increments each time scheduler goes
 * from one animation frame to another, or starts executing microtasks.
 *
 * @constructor
 * @struct
 * @final
 */
kivi.scheduler.Scheduler = function() {
  /** @type {number} */
  this.flags = 0;

  /**
   * Monotonically increasing internal clock.
   *
   * @type {number}
   */
  this.clock = 1;

  /** @private {!Array<function()>} */
  this._microtasks = [];

  /** @private {!Array<function()>} */
  this._macrotasks = [];

  /** @private {!kivi.scheduler.Frame} */
  this._currentFrame = new kivi.scheduler.Frame();

  /** @private {!kivi.scheduler.Frame} */
  this._nextFrame = new kivi.scheduler.Frame();

  var self = this;

  /** @private {!kivi.scheduler.MutationObserver} */
  this._microtaskScheduler = new kivi.scheduler.MutationObserver(function() {
    self.flags |= kivi.scheduler.SchedulerFlags.RUNNING;

    var tasks = self._microtasks;
    while (tasks.length > 0) {
      self._microtasks = [];

      for (var i = 0; i < tasks.length; i++) {
        tasks[i]();
      }

      tasks = self._microtasks;
    }

    self.clock++;
    self.flags &= ~(kivi.scheduler.SchedulerFlags.MICROTASK_PENDING | kivi.scheduler.SchedulerFlags.RUNNING);
  });

  /** @private {!kivi.scheduler.PostMessage} */
  this._macrotaskScheduler = new kivi.scheduler.PostMessage(function() {
    self.flags &= ~kivi.scheduler.SchedulerFlags.MACROTASK_PENDING;
    self.flags |= kivi.scheduler.SchedulerFlags.RUNNING;

    var tasks = self._macrotasks;
    if (tasks.length > 0) {
      self._macrotasks = [];

      for (var i = 0; i < tasks.length; i++) {
        tasks[i]();
      }
    }

    self.clock++;
    self.flags &= ~kivi.scheduler.SchedulerFlags.RUNNING;
  });

  /** @private {function(number)} */
  this._handleAnimationFrame = function() {
    var frame;
    var groups;
    var group;
    var task;
    var i, j;

    self.flags &= ~kivi.scheduler.SchedulerFlags.FRAMETASK_PENDING;
    self.flags |= kivi.scheduler.SchedulerFlags.RUNNING;

    frame = self._nextFrame;
    self._nextFrame = self._currentFrame;
    self._currentFrame = frame;

    do {
      while ((frame.flags & kivi.scheduler.FrameFlags.WRITE_ANY) !== 0) {
        if ((frame.flags & kivi.scheduler.FrameFlags.WRITE_PRIO) !== 0) {
          frame.flags &= ~kivi.scheduler.FrameFlags.WRITE_PRIO;
          groups = frame.writeTaskGroups;

          for (i = 0; i < groups.length; i++) {
            group = groups[i];
            if (group !== null) {
              groups[i] = null;
              for (j = 0; j < group.length; j++) {
                task = group[j];
                if (task.constructor === kivi.Component) {
                  /** {!kivi.Component} */(task).update();
                } else {
                  /** {!function()} */(task).call();
                }
              }
            }
          }
        }

        if ((frame.flags & kivi.scheduler.FrameFlags.WRITE) !== 0) {
          frame.flags &= ~kivi.scheduler.FrameFlags.WRITE;
          group = frame.writeTasks;
          for (i = 0; i < group.length; i++) {
            task = group[i];
            if (task.constructor === kivi.Component) {
              /** {!kivi.Component} */(task).update();
            } else {
              /** {!function()} */(task).call();
            }
          }
        }
      }

      while ((frame.flags & kivi.scheduler.FrameFlags.READ) !== 0) {
        frame.flags &= ~kivi.scheduler.FrameFlags.READ;
        group = frame.readTasks;
        frame.readTasks = null;

        for (i = 0; i < group.length; i++) {
          task = group[i];
          task();
        }
      }
    } while ((frame.flags & kivi.scheduler.FrameFlags.WRITE_ANY) !== 0);

    while ((frame.flags & kivi.scheduler.FrameFlags.AFTER) !== 0) {
      frame.flags &= ~kivi.scheduler.FrameFlags.AFTER;

      group = frame.afterTasks;
      for (i = 0; i < group.length; i++) {
        task = group[i];
        task();
      }
    }

    self.clock++;
    self.flags &= ~kivi.scheduler.SchedulerFlags.RUNNING;
  };
};

/**
 * Get current frame.
 *
 * @returns {!kivi.scheduler.Frame}
 */
kivi.scheduler.Scheduler.prototype.currentFrame = function() {
  return this._currentFrame;
};

/**
 * Get next frame.
 *
 * @returns {!kivi.scheduler.Frame}
 */
kivi.scheduler.Scheduler.prototype.nextFrame = function() {
  if ((this.flags & kivi.scheduler.SchedulerFlags.FRAMETASK_PENDING) === 0) {
    this.flags |= kivi.scheduler.SchedulerFlags.FRAMETASK_PENDING;
    window.requestAnimationFrame(this._handleAnimationFrame);
  }
  return this._nextFrame;
};

/**
 * Schedule microtask.
 *
 * @param {!function()} cb
 */
kivi.scheduler.Scheduler.prototype.scheduleMicrotask = function(cb) {
  if ((this.flags & kivi.scheduler.SchedulerFlags.MICROTASK_PENDING) === 0) {
    this.flags |= kivi.scheduler.SchedulerFlags.MICROTASK_PENDING;
    this._microtaskScheduler.requestNextTick();
  }

  this._microtasks.push(cb);
};

/**
 * Schedule macrotask.
 *
 * @param {!function()} cb
 */
kivi.scheduler.Scheduler.prototype.scheduleMacrotask = function(cb) {
  if ((this.flags & kivi.scheduler.SchedulerFlags.MACROTASK_PENDING) === 0) {
    this.flags |= kivi.scheduler.SchedulerFlags.MACROTASK_PENDING;
    this._macrotaskScheduler.requestNextTick();
  }

  this._macrotasks.push(cb);
};

/**
 * Global scheduler instance.
 *
 * @const {!kivi.scheduler.Scheduler}
 */
kivi.scheduler.instance = new kivi.scheduler.Scheduler();
