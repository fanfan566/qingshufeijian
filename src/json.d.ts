declare module '*.json' {
  const value: {
    nodes: Array<{
      id: string;
      label: string;
      group: number;
      description: string;
    }>;
    links: Array<{
      source: string;
      target: string;
      value: number;
    }>;
  };
  export default value;
}
