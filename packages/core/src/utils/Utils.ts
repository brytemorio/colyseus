
import nanoid from 'nanoid';
import { addExtension } from 'msgpackr';

import { debugAndPrintError } from '../Debug';
import { EventEmitter } from "events";
import { ServerOpts, Socket } from "net";
import { Schema } from "@colyseus/schema";

// remote room call timeouts
export const REMOTE_ROOM_SHORT_TIMEOUT = Number(process.env.COLYSEUS_PRESENCE_SHORT_TIMEOUT || 2000);

export function generateId(length: number = 9) {
  return nanoid(length);
}

export function getBearerToken(authHeader: string) {
  return (authHeader && authHeader.startsWith("Bearer ") && authHeader.substring(7, authHeader.length)) || undefined;
}

// nodemon sends SIGUSR2 before reloading
// (https://github.com/remy/nodemon#controlling-shutdown-of-your-script)
//
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

export function registerGracefulShutdown(callback: (err?: Error) => void) {
  /**
   * Gracefully shutdown on uncaught errors
   */
  process.on('uncaughtException', (err) => {
    debugAndPrintError(err);
    callback(err);
  });

  signals.forEach((signal) =>
    process.once(signal, () => callback()));
}

export function retry<T = any>(
  cb: Function,
  maxRetries: number = 3,
  errorWhiteList: any[] = [],
  retries: number = 0,
) {
  return new Promise<T>((resolve, reject) => {
    cb()
      .then(resolve)
      .catch((e) => {
        if (
          errorWhiteList.indexOf(e.constructor) !== -1 &&
          retries++ < maxRetries
        ) {
          setTimeout(() => {
            retry<T>(cb, maxRetries, errorWhiteList, retries).
              then(resolve).
              catch((e2) => reject(e2));
          }, Math.floor(Math.random() * Math.pow(2, retries) * 400));

        } else {
          reject(e);
        }
      });
  });
}

export function spliceOne(arr: any[], index: number): boolean {
  // manually splice availableRooms array
  // http://jsperf.com/manual-splice
  if (index === -1 || index >= arr.length) {
    return false;
  }

  const len = arr.length - 1;
  for (let i = index; i < len; i++) {
    arr[i] = arr[i + 1];
  }

  arr.length = len;
  return true;
}

export class Deferred<T= any> {
  public promise: Promise<T>;

  public resolve: Function;
  public reject: Function;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  public then(func: (value: T) => any) {
    return this.promise.then.apply(this.promise, arguments);
  }

  public catch(func: (value: any) => any) {
    return this.promise.catch(func);
  }

}

export function merge(a: any, ...objs: any[]): any {
  for (let i = 0, len = objs.length; i < len; i++) {
    const b = objs[i];
    for (const key in b) {
      if (b.hasOwnProperty(key)) {
        a[key] = b[key];
      }
    }
  }
  return a;
}

export function wrapTryCatch(
  method: Function,
  onError: (e: Error, methodName: string, args: any[]) => void,
  methodName: string,
  rethrow: boolean = false
) {
  return (...args: any[]) => {
    try {
      return method(...args);

    } catch (e) {
      onError(e, methodName, args);

      // some internal methods should rethrow the error (onJoin, onLeave, onCreate)
      if (rethrow) { throw e; }
    }
  };
}

export declare interface DummyServer {
  constructor(options?: ServerOpts, connectionListener?: (socket: Socket) => void);

  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  close(callback?: (err?: Error) => void): this;
}

export class DummyServer extends EventEmitter {}

// Add msgpackr extension to avoid circular references when encoding
// https://github.com/kriszyp/msgpackr#custom-extensions
addExtension({
  Class: Schema,
  type: 0,

  read(datum: any): any {
    return datum;
  },

  write(instance: any): any {
    return instance.toJSON();
  }
});
