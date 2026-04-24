'use client';

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  Position,
  MarkerType,
} from '@xyflow/react';
import { useEffect, useMemo, useCallback } from 'react';

import { AgentNode, type AgentNodeData } from './AgentNode';
import { ChallengeEdge } from './ChallengeEdge';
import type { AgentId, AgentStatus, Challenge, Rebuttal } from './debate.types';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { challengeEdge: ChallengeEdge };
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

const AGENT_CONFIG: { id: AgentId; label: string; x: number; y: number }[] = [  
  { id: 'build_analyzer', label: 'Build Analyzer', x: 350, y: 150 },
  { id: 'code_reviewer', label: 'Code Reviewer', x: 350, y: 300 },
  { id: 'test_analyzer', label: 'Test Analyzer', x: 350, y: 450 },
  { id: 'dependency_checker', label: 'Dependency Checker', x: 350, y: 600 },
  { id: 'judge', label: 'Judge', x: 750, y: 375 },
];

const BASE_NODES: Node[] = [
  {
    id: 'root_event',
    type: 'input',
    position: { x: 50, y: 375 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label: 'CI/CD Failure Event' },
    style: {
      background: '#0a0a0a',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '12px 24px',
      width: 180,
      textAlign: 'center',
      fontSize: '12px',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      fontWeight: 'bold',
      boxShadow: '0 0 15px -3px rgba(0, 0, 0, 0.5)'
    },
  },
];

const BASE_EDGES: Edge[] = [
  ...AGENT_CONFIG.filter((a) => a.id !== 'judge').map((a) => ({
    id: `root-to-${a.id}`,
    source: 'root_event',
    target: a.id,
    type: 'default',
    animated: true,
    style: { stroke: 'rgba(255,255,255,0.2)' },
  })),
  ...AGENT_CONFIG.filter((a) => a.id !== 'judge').map((a) => ({
    id: `${a.id}-to-judge`,
    source: a.id,
    target: 'judge',
    type: 'default',
    animated: true,
    style: { stroke: 'rgba(255,255,255,0.2)' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(255,255,255,0.2)',
    },
  })),
];

interface Props {
  statuses: Record<AgentId, AgentStatus>;
  confidences: Partial<Record<AgentId, number>>;
  baselineConfidences?: Partial<Record<AgentId, number>>;
  challenges: Challenge[];
  rebuttals: Partial<Record<AgentId, Rebuttal>>;
  onHoverNode?: (id: AgentId | null) => void;
}

export function DebateGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <DebateGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function DebateGraphInner({ statuses, confidences, baselineConfidences, challenges, rebuttals, onHoverNode }: Props) {
  const reactFlowInstance = useReactFlow();

  const derivedNodes: Node[] = useMemo(
    () => [
      ...BASE_NODES,
      ...AGENT_CONFIG.map((a) => ({
        id: a.id,
        type: 'agentNode',
        draggable: true,
        selectable: true,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        position: { x: a.x, y: a.y },
        data: {
          agentId: a.id,
          label: a.label,
          status: statuses[a.id] ?? 'idle',
          confidence: confidences[a.id],
          confidenceDelta:
            typeof confidences[a.id] === 'number' && typeof baselineConfidences?.[a.id] === 'number'
              ? confidences[a.id]! - baselineConfidences[a.id]!
              : undefined,
          rebuttalPosition: rebuttals[a.id]?.position,
        } satisfies AgentNodeData,
      }))
    ],
    [statuses, confidences, baselineConfidences, rebuttals],
  );

  const derivedEdges: Edge[] = useMemo(
    () => [
      ...BASE_EDGES,
      ...challenges.map((challenge) => {
        const rebuttal = rebuttals[challenge.targetAgentId];
        const isResolved = Boolean(rebuttal);
        const position = rebuttal?.position;
        const color = isResolved 
            ? (position === 'DEFEND' ? '#3b82f6' : '#ef4444') 
            : '#f59e0b';
            
        let label = `Contradicts ${challenge.targetAgentId.split('_').join(' ')}`;
        if (isResolved) {
            label = `${position === 'DEFEND' ? 'Defended' : position === 'CONCEDE' ? 'Conceded' : 'Compromised'} against ${challenge.challengerAgentId.split('_').join(' ')}`;
        }

        return {
            id: challenge.challengeId,
            source: challenge.challengerAgentId,
            target: challenge.targetAgentId,
            type: 'challengeEdge',
            selectable: false,
            animated: true,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: color,
            },
            data: {
                label,      
                resolved: isResolved,
                position: position,
            },
        };
      }),
    ],
    [challenges, rebuttals],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes((nds) =>
      derivedNodes.map((dn) => {
        const existing = nds.find((n) => n.id === dn.id);
        return {
          ...dn,
          position: existing ? existing.position : dn.position,
          measured: existing?.measured,
          width: existing?.width,
          height: existing?.height,
        };
      }),
    );
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    onHoverNode?.(node.id as AgentId);
  }, [onHoverNode]);

  const onPaneMouseEnter = useCallback(() => {
    onHoverNode?.(null);
  }, [onHoverNode]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const zoom = node.id === 'root_event' ? 1.5 : 1.2;
      reactFlowInstance.setCenter(node.position.x + (node.id === 'root_event' ? 90 : 120), node.position.y + 40, {
        zoom,
        duration: 800,
      });
      // We can also trigger the overlay by setting hover node on click so it stays
      onHoverNode?.(node.id as AgentId);
    },
    [reactFlowInstance, onHoverNode]
  );

  return (
    <div className="h-full w-full bg-[#0A0A0A]">  
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          onPaneMouseEnter();
          reactFlowInstance.fitView({ duration: 800, padding: 0.2 });
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.5}
        maxZoom={2}
        panOnDrag={true}
        zoomOnPinch={true}
        zoomOnScroll={true}
        zoomOnDoubleClick={true}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={PRO_OPTIONS}
        className="bg-transparent"
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background
          color="rgba(103, 133, 160, 0.08)"
          gap={24}
          variant={BackgroundVariant.Dots}
          size={1.5}
        />
      </ReactFlow>
    </div>
  );
}
