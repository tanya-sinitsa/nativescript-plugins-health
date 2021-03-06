import { NgModule } from '@angular/core'
import { Routes } from '@angular/router'
import { NativeScriptRouterModule } from '@nativescript/angular'


const routes: Routes = [
  { path: '', redirectTo: '/test', pathMatch: 'full' },
  // during test, `.default` and `DefaultModule` from the next line
  // will be replaced with values from a tested plugin
  { path: 'test', loadChildren: () => import('./plugins/.default').then((m) => m.DefaultModule) }
]

@NgModule({
  imports: [NativeScriptRouterModule.forRoot(routes)],
  exports: [NativeScriptRouterModule],
})
export class AppRoutingModule {
}
