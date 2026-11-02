import type { AuthApi } from '../../../auth/contracts';
import type { ProfileIdentityReader } from '../../application/ports/profile-repository';

export class AuthIdentityReader implements ProfileIdentityReader {
  constructor(private readonly auth: AuthApi) {}
  async find(userId: string) {
    const user = await this.auth.findById(userId);
    if (!user) throw new Error('Account was not found.');
    return { name: user.name, email: user.email };
  }
}
