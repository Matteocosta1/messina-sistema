// Tipi minimi di React per il controllo con tsc quando @types/react non si può installare
// (in questo ambiente il registro npm non è raggiungibile). Con npm install si usano quelli veri.
declare module 'react' {
  namespace React {
    type ReactNode = any;
    type CSSProperties = { [k: string]: any };
    type Dispatch<A> = (a: A) => void;
    type SetStateAction<S> = S | ((p: S) => S);
    interface Context<T> { Provider: any; Consumer: any }
    interface RefObject<T> { current: T | null }
    function useState<T>(i: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
    function useState<T = undefined>(): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
    function useEffect(f: () => void | (() => void), d?: readonly unknown[]): void;
    function useLayoutEffect(f: () => void | (() => void), d?: readonly unknown[]): void;
    function useCallback<T extends (...a: any[]) => any>(f: T, d: readonly unknown[]): T;
    function useMemo<T>(f: () => T, d: readonly unknown[]): T;
    function useRef<T>(i: T): { current: T };
    function useRef<T>(i: T | null): RefObject<T>;
    function useRef<T = undefined>(): { current: T | undefined };
    function useContext<T>(c: Context<T>): T;
    function useReducer(...a: any[]): any;
    function createContext<T>(d: T): Context<T>;
    const Fragment: any;
    function memo<T>(c: T): T;
  }
  export = React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any; export const jsxs: any; export const Fragment: any;
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements { [k: string]: any }
    interface IntrinsicAttributes { key?: any }
    interface ElementChildrenAttribute { children: {} }
  }
}
declare module 'react-dom/client' { export function createRoot(e: Element): { render(n: any): void } }
declare module '*.css' { const s: string; export default s }
declare module '*.svg' { const s: string; export default s }
