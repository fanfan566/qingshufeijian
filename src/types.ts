import * as d3 from 'd3';

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'disease' | 'symptom' | 'treatment' | 'nutrition';
  description?: string;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: string;
  target: string;
  relation: string;
}

export interface KnowledgeGraphData {
  nodes: Node[];
  links: Link[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export type PageType = 'welcome' | 'dashboard' | 'segmentation' | 'graph' | 'knowledge' | 'chat' | 'consultation' | 'plans' | 'crawler';
