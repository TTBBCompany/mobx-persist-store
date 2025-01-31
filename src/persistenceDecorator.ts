import { extendObservable, reaction, ObservableMap, makeAutoObservable } from 'mobx';

import { StorageConfiguration } from './StorageConfiguration';
import { PersistenceStore, PersistenceDecoratorOptions } from './types';
import { getObjectKeys, getObservableTargetObject, mobxNewestVersionSelect } from './utils';

export function persistenceDecorator(options: PersistenceDecoratorOptions) {
  return function <T extends { new (...args: any): {} } | Object>(target: T) {
    StorageConfiguration.setAdapter(options.name, options.adapter);

    const properties = options.properties as (keyof T)[];
    const targetPrototype = mobxNewestVersionSelect(
      () => target,
      // @ts-ignore
      () => target.prototype,
    )() as PersistenceStore<T>;

    const extendObservableWrapper = mobxNewestVersionSelect(Object.assign, extendObservable);
    const observableTargetPrototype = extendObservableWrapper(targetPrototype, {
      _isPersistence: true,
      _storageName: options.name,
      get _asJS() {
        return getObservableTargetObject(targetPrototype, properties);
      },
    });

    const disposer = reaction(
      mobxNewestVersionSelect(
        () => getObservableTargetObject(targetPrototype, properties),
        // @ts-ignore
        () => targetPrototype._asJS,
      ),
      (jsObject) => options.adapter.writeInStorage(options.name, jsObject),
      options.reactionOptions,
    );

    StorageConfiguration.setDisposers(targetPrototype, [disposer]);

    options.adapter.readFromStorage<typeof targetPrototype>(options.name).then((content) => {
      if (content) {
        getObjectKeys(content).forEach((property) => {
          if (targetPrototype[property] instanceof ObservableMap) {
            const targetPartial = targetPrototype[property];
            const mapSource = getObjectKeys(content[property]).reduce<
              [keyof typeof targetPartial, Record<string, any>][]
            >((p, k) => {
              p.push([k, content[property][k]]);
              return p;
            }, []);
            const observableMap = new Map(mapSource);
            targetPrototype[property] = (observableMap as unknown) as typeof targetPartial;
          } else {
            targetPrototype[property] = content[property];
          }
        });
      }

      StorageConfiguration.setIsSynchronized(targetPrototype, true);
    });

    return mobxNewestVersionSelect(
      () => observableTargetPrototype,
      () => target,
    )() as PersistenceStore<T>;
  };
}
