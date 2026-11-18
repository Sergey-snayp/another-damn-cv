/** One job on the CV as drawn: its bullets, and the height they take together. */
export interface RoleSpace {
  bullets: number;
  height: number;
}
export interface BulletRoom {
  min: number;
  max: number;
}

/** A job keeps at least this many: the two latest 3, the two before 2, older ones 1. */
const fewest = (position: number) => (position < 2 ? 3 : position < 4 ? 2 : 1);
/** With room to spare, one of the two latest jobs may gain up to this many. */
const MOST_NEW = 2;

/**
 * How many bullets each job may have so the CV fits two pages. `spare` is the room
 * left on the second page, below zero when the CV runs over. A CV that fits loses
 * nothing. One that does not gives up bullets from its oldest jobs first, and no
 * job is ever emptied.
 */
export function bulletBudget(roles: RoleSpace[], spare: number): BulletRoom[] {
  const rooms = roles.map(({ bullets }) => ({ min: bullets, max: bullets }));
  const each = ({ bullets, height }: RoleSpace) => (bullets ? height / bullets : 0);
  if (spare >= 0) {
    let left = spare;
    roles.slice(0, 2).forEach((role, index) => {
      const size = each(role);
      for (let added = 0; size > 0 && added < MOST_NEW && left >= size; added++) {
        rooms[index]!.max++;
        left -= size;
      }
    });
    return rooms;
  }
  let over = -spare;
  for (let index = roles.length - 1; index >= 0 && over > 0; index--) {
    const role = roles[index]!;
    const room = rooms[index]!;
    const floor = Math.min(role.bullets, fewest(index));
    while (room.min > floor && over > 0) {
      room.min--;
      room.max--;
      over -= each(role);
    }
  }
  return rooms;
}
