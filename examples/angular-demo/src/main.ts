import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { TodosComponent } from './app/todos.component';

bootstrapApplication(TodosComponent, appConfig).catch((err) =>
  console.error(err)
);
