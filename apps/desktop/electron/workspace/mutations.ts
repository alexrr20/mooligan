type Mutation<Result> = () => Result | PromiseLike<Result>;

export class MutationQueue {
  #operations = Promise.resolve();

  run<Result>(operation: Mutation<Result>): Promise<Result> {
    const execute = async () => await operation();
    const result = this.#operations.then(execute, execute);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export async function runForUnchangedRevision<Result>(
  readRevision: () => number,
  operation: () => Promise<Result>,
) {
  const revision = readRevision();
  const result = await operation();

  if (readRevision() !== revision) {
    throw new Error("Spoiler choices changed before this action completed.");
  }

  return result;
}
