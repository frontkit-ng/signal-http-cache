import { Component, OnInit } from '@angular/core';
import { createQuery, createMutation } from '../../../../../packages/core/src';

interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    @if (loading()) {
    <div>Loading...</div>
    } @if (error()) {
    <div style="color: red">{{ error()?.message }}</div>
    } @if (todos()) {
    <ul>
      @for (todo of todos(); track todo.id) {
      <li>
        <span [style.textDecoration]="todo.completed ? 'line-through' : 'none'">
          {{ todo.title }}
        </span>
        <button
          (click)="deleteTodo(todo.id)"
          [disabled]="deleteMutation.isPending()"
        >
          Delete
        </button>
      </li>
      }
    </ul>
    }

    <div style="margin: 16px 0">
      <input
        #input
        type="text"
        placeholder="New todo"
        (keyup.enter)="addTodo(input)"
      />
      <button (click)="addTodo(input)" [disabled]="addMutation.isPending()">
        {{ addMutation.isPending() ? 'Adding...' : 'Add' }}
      </button>
    </div>

    @if (addMutation.isSuccess()) {
    <div style="color: green">
      ✅ Added: {{ addMutation.data()?.title }} (ID:
      {{ addMutation.data()?.id }})
    </div>
    } @if (deleteMutation.isSuccess()) {
    <div style="color: orange">
      🗑️ Deleted successfully (Note: JSONPlaceholder doesn't actually delete)
    </div>
    }

    <button (click)="refresh()">Refresh</button>
  `,
})
export class TodosComponent implements OnInit {
  private todosQuery = createQuery<Todo[]>(
    'https://jsonplaceholder.typicode.com/todos?_limit=5',
    { ttl: 60000, staleWhileRevalidate: true }
  );

  addMutation = createMutation<
    Todo,
    { title: string; completed: boolean; userId: number }
  >('https://jsonplaceholder.typicode.com/todos', {
    onSuccess: () => console.log('Todo added'),
  });

  deleteMutation = createMutation<{}, number>(
    (id) => `https://jsonplaceholder.typicode.com/todos/${id}`,
    {
      method: 'DELETE',
      onSuccess: () => console.log('Todo deleted'),
    }
  );

  todos = this.todosQuery.data;
  loading = this.todosQuery.loading;
  error = this.todosQuery.error;

  ngOnInit() {
    this.todosQuery.fetch();
  }

  addTodo(input: HTMLInputElement) {
    if (input.value.trim()) {
      this.addMutation.mutate({
        title: input.value.trim(),
        completed: false,
        userId: 1,
      });
      input.value = '';
    }
  }

  deleteTodo(id: number) {
    this.deleteMutation.mutate(id);
  }

  refresh() {
    this.todosQuery.fetch(true);
  }
}
