import { ApplicationRef, DestroyRef, Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { first } from 'rxjs/operators';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(first((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => document.location.reload());

    this.appRef.isStable.pipe(first((stable) => stable)).subscribe(() => {
      void this.swUpdate.checkForUpdate();
      const intervalId = setInterval(() => void this.swUpdate.checkForUpdate(), CHECK_INTERVAL_MS);
      this.destroyRef.onDestroy(() => clearInterval(intervalId));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.swUpdate.checkForUpdate();
      }
    });
  }
}
