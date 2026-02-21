import { registerSW } from 'virtual:pwa-register';

registerSW({
    immediate: true,
    onRegistered(r) {
        if (r) {
            console.log('SW Registered');
        }
    },
    onRegisterError(error) {
        console.error('SW registration error', error);
    }
});
