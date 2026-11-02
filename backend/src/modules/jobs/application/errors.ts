export class JobNotFoundError extends Error {
  constructor() {
    super('No such job.');
    this.name = 'JobNotFoundError';
  }
}

export class JobInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobInputError';
  }
}

export class JobConflictError extends Error {
  constructor() {
    super('This job has moved since. Change its status instead.');
    this.name = 'JobConflictError';
  }
}
