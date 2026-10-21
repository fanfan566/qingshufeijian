import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Info, ZoomIn, ZoomOut, Maximize2, Share2, Filter, Activity, Sparkles, X, Check, Minimize2 } from 'lucide-react';
import knowledgeGraphData from '../data/knowledgeGraphData.json';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: number;
  label: string;
  description: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  value: number;
}

const initialData: { nodes: Node[]; links: Link[] } = knowledgeGraphData;

// 节点类型映射
const groupLabels: Record<number, string> = {
  1: '核心器官',
  2: '解剖结构',
  3: '病变类型',
  4: '影像学检查',
  5: '治疗方案'
};

const groupColors: Record<number, string> = {
  1: '#6366F1',
  2: '#8B5CF6',
  3: '#EC4899',
  4: '#F43F5E',
  5: '#F59E0B'
};

export const KnowledgeGraphPage: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [shareUrl, setShareUrl] = useState('');
  const [activeGroups, setActiveGroups] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [showLabels, setShowLabels] = useState(true);
  
  // 存储 D3 相关引用
  const svgRef_current = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const simulationRef = useRef<d3.Simulation<Node, d3.SimulationLinkDatum<Node>> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // 初始化图谱
  const initGraph = useCallback(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svgRef_current.current = svg;

    const g = svg.append('g');
    gRef.current = g;

    // 创建缩放行为
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoomTransform(event.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // 创建力导向模拟 - 增加节点间距离
    const simulation = d3.forceSimulation<Node>(initialData.nodes)
      .force('link', d3.forceLink<Node, Link>(initialData.links).id((d) => d.id).distance(120)) // 增加连接距离：60 -> 120
      .force('charge', d3.forceManyBody().strength(-300)) // 增加排斥力：-150 -> -300，使节点更分散
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30)) // 增加碰撞半径：25 -> 30，防止节点重叠
      .force('x', d3.forceX(width / 2).strength(0.05)) // 减弱中心引力：0.08 -> 0.05
      .force('y', d3.forceY(height / 2).strength(0.05));
    simulationRef.current = simulation;

    // 创建链接 - 优化样式
    const link = g.append('g')
      .selectAll('line')
      .data(initialData.links)
      .enter().append('line')
      .attr('stroke', '#CBD5E1')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', (d) => Math.sqrt(d.value) * 1.5)
      .attr('class', 'graph-link');

    // 创建节点组
    const node = g.append('g')
      .selectAll('g')
      .data(initialData.nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        highlightConnectedLinks(d); // 高亮相连的边
      });

    // 节点圆圈 - 优化大小和样式
    node.append('circle')
      .attr('r', 20)
      .attr('fill', (d) => groupColors[d.group] || '#6366F1')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))')
      .attr('class', (d) => `node-circle node-${d.id}`)
      .on('mouseover', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 24)
          .attr('stroke-width', 4);
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 20)
          .attr('stroke-width', 3);
      });

    // 节点文字 - 优化显示
    const nodeText = node.append('text')
      .text((d) => d.label)
      .attr('dy', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-weight', '700')
      .attr('font-size', '10px')
      .style('pointer-events', 'none')
      .attr('class', (d) => `node-text node-${d.id}`)
      .style('textShadow', '0 1px 2px rgba(0,0,0,0.3)');
    
    // 初始化标签显示状态
    if (!showLabels) {
      nodeText.attr('opacity', 0);
    }

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // 高亮相连的边和节点
    const highlightConnectedLinks = (selectedNode: Node) => {
      const svg = svgRef_current.current;
      if (!svg) return;

      // 找出所有与选中节点相连的边
      const connectedLinkIds = new Set<number>();
      initialData.links.forEach((link, index) => {
        if ((link.source as any).id === selectedNode.id || (link.target as any).id === selectedNode.id) {
          connectedLinkIds.add(index);
        }
      });

      // 找出所有相连的节点 ID
      const connectedNodeIds = new Set<string>();
      initialData.links.forEach((link) => {
        if ((link.source as any).id === selectedNode.id) {
          connectedNodeIds.add((link.target as any).id);
        }
        if ((link.target as any).id === selectedNode.id) {
          connectedNodeIds.add((link.source as any).id);
        }
      });
      connectedNodeIds.add(selectedNode.id);

      // 更新边的样式
      svg.selectAll('.graph-link')
        .transition()
        .duration(200)
        .attr('stroke', (d, i) => connectedLinkIds.has(i) ? '#F59E0B' : '#CBD5E1') // 连接的边变为橙色
        .attr('stroke-opacity', (d, i) => connectedLinkIds.has(i) ? 1 : 0.3) // 未连接的边变淡
        .attr('stroke-width', (d, i) => connectedLinkIds.has(i) ? Math.sqrt((d as any).value) * 2.5 : Math.sqrt((d as any).value) * 1.5);

      // 更新节点的样式
      svg.selectAll('.node-circle')
        .transition()
        .duration(200)
        .attr('opacity', (d: any) => connectedNodeIds.has(d.id) ? 1 : 0.3); // 未连接的节点变淡
      
      svg.selectAll('.node-text')
        .transition()
        .duration(200)
        .attr('opacity', (d: any) => connectedNodeIds.has(d.id) ? 1 : 0.2);
    };

    // 重置所有元素样式
    const resetAllStyles = () => {
      const svg = svgRef_current.current;
      if (!svg) return;

      svg.selectAll('.graph-link')
        .transition()
        .duration(200)
        .attr('stroke', '#CBD5E1')
        .attr('stroke-opacity', 0.8)
        .attr('stroke-width', (d) => Math.sqrt((d as any).value) * 1.5);

      svg.selectAll('.node-circle')
        .transition()
        .duration(200)
        .attr('opacity', 1);
      
      svg.selectAll('.node-text')
        .transition()
        .duration(200)
        .attr('opacity', showLabels ? 1 : 0);
    };

    // 拖拽空白区域移动图谱
    svg.on('click', () => {
      setSelectedNode(null);
      setSelectedNodes(new Set());
      resetAllStyles(); // 重置所有元素样式
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
      event.sourceEvent.stopPropagation();
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }, []);

  // 放大 5%
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentTransform = d3.zoomTransform(svgRef.current);
    const newScale = currentTransform.k * 1.05;
    svg.transition()
      .duration(300)
      .call(zoomRef.current.scaleTo, newScale);
  }, []);

  // 缩小 5%
  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentTransform = d3.zoomTransform(svgRef.current);
    const newScale = Math.max(0.1, currentTransform.k * 0.95);
    svg.transition()
      .duration(300)
      .call(zoomRef.current.scaleTo, newScale);
  }, []);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('全屏失败:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 切换标签显示
  const toggleLabels = useCallback(() => {
    setShowLabels(!showLabels);
    if (svgRef_current.current) {
      svgRef_current.current.selectAll('.node-text')
        .transition()
        .duration(300)
        .attr('opacity', showLabels ? 0 : 1);
    }
  }, [showLabels]);

  // 筛选功能
  const toggleGroup = (group: number) => {
    const newGroups = new Set(activeGroups);
    if (newGroups.has(group)) {
      newGroups.delete(group);
    } else {
      newGroups.add(group);
    }
    setActiveGroups(newGroups);
    applyFilter(newGroups);
  };

  const applyFilter = (groups: Set<number>) => {
    if (!gRef.current) return;
    
    const svg = svgRef_current.current;
    if (!svg) return;

    // 显示/隐藏节点和链接
    svg.selectAll('.node-circle').attr('opacity', (d: any) => 
      groups.has(d.group) ? 1 : 0.1);
    svg.selectAll('.node-text').attr('opacity', (d: any) => 
      groups.has(d.group) ? 1 : 0.1);
  };

  // 分享功能 - 选择节点
  const toggleNodeSelection = (nodeId: string) => {
    const newSelected = new Set(selectedNodes);
    if (newSelected.has(nodeId)) {
      newSelected.delete(nodeId);
    } else {
      newSelected.add(nodeId);
    }
    setSelectedNodes(newSelected);
    
    // 视觉反馈
    if (gRef.current) {
      const svg = svgRef_current.current;
      if (svg) {
        svg.selectAll('.node-circle').attr('stroke-width', (d: any) => 
          newSelected.has(d.id) ? 8 : 4);
        svg.selectAll('.node-circle').attr('stroke', (d: any) => 
          newSelected.has(d.id) ? '#F59E0B' : '#fff');
      }
    }
  };

  // 生成分享链接
  const generateShareLink = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const nodeIds = Array.from(selectedNodes);
    const params = new URLSearchParams();
    if (nodeIds.length > 0) {
      params.set('nodes', nodeIds.join(','));
    }
    const url = `${baseUrl}?${params.toString()}`;
    setShareUrl(url);
    
    // 复制到剪贴板
    navigator.clipboard.writeText(url).then(() => {
      alert('链接已复制到剪贴板！');
    });
  };

  // 进入分享选择模式
  const enterShareMode = () => {
    setShowShareModal(true);
    setSelectedNodes(new Set());
  };

  // 初始化
  useEffect(() => {
    initGraph();
    
    // 检查 URL 参数
    const params = new URLSearchParams(window.location.search);
    const nodesParam = params.get('nodes');
    if (nodesParam) {
      const nodeIds = nodesParam.split(',');
      // 可以高亮显示的节点
      console.log('分享的节点:', nodeIds);
    }
  }, [initGraph]);

  // 处理搜索
  useEffect(() => {
    if (!gRef.current || !svgRef_current.current) return;
    const svg = svgRef_current.current;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      svg.selectAll('.node-circle').attr('opacity', (d: any) => 
        d.label.toLowerCase().includes(query) || 
        d.description.toLowerCase().includes(query) ? 1 : 0.2);
      svg.selectAll('.node-text').attr('opacity', (d: any) => 
        d.label.toLowerCase().includes(query) || 
        d.description.toLowerCase().includes(query) ? 1 : 0.2);
    } else {
      svg.selectAll('.node-circle').attr('opacity', 1);
      svg.selectAll('.node-text').attr('opacity', 1);
    }
  }, [searchQuery]);

  return (
    <div ref={containerRef} className={`h-screen bg-brand-bg flex gap-6 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
      {/* Sidebar Controls */}
      <div className="w-[21rem] flex flex-col gap-5 shrink-0 pt-3 xl:w-[22rem]">
        <header className="space-y-3 px-1">
          <div className="inline-flex items-center gap-2 bg-night-sky/10 text-night-sky px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
            <Activity size={14} />
            <span>医学知识库</span>
          </div>
          <h2 className="text-4xl font-black text-night-deep">肺部知识图谱</h2>
          <p className="text-slate-400 font-medium">可视化探索肺部解剖、疾病、诊断与治疗之间的复杂关联。</p>
        </header>

        <div className="soft-card p-5 space-y-5 flex-1 overflow-y-auto xl:p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="搜索知识节点..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-night-royal/20 transition-all"
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">节点详情</h3>
            {selectedNode ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="p-6 rounded-[24px] bg-gradient-to-br from-night-royal to-night-sky text-white shadow-xl shadow-night-royal/20">
                  <h4 className="text-2xl font-black mb-2">{selectedNode.label}</h4>
                  <p className="text-sm text-white/80 leading-relaxed font-medium">{selectedNode.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">关联度</div>
                    <div className="text-lg font-black text-night-deep">高</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">节点类型</div>
                    <div className="text-lg font-black text-night-deep">{groupLabels[selectedNode.group]}</div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const baikeUrl = `https://baike.baidu.com/item/${encodeURIComponent(selectedNode.label)}`;
                    window.open(baikeUrl, '_blank');
                  }}
                  className="w-full py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-night-royal hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Info size={18} />
                  查看完整百科
                </button>
              </motion.div>
            ) : (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-[20px] flex items-center justify-center text-slate-200 mx-auto">
                  <Sparkles size={32} />
                </div>
                <p className="text-slate-400 font-bold">点击图谱中的节点<br/>查看详细信息</p>
              </div>
            )}
          </div>
        </div>

        <div className="soft-card p-5 flex items-center justify-between xl:p-6">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`w-3 h-3 rounded-full bg-night-royal opacity-${i*20}`} />
            ))}
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">数据已更新至 2026</span>
        </div>
      </div>

      {/* Graph Container */}
      <div className="min-w-0 flex-1 relative soft-card bg-white/50 backdrop-blur-sm overflow-hidden border-white">
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        
        {/* Graph Controls */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-3">
          <button 
            onClick={handleZoomIn}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title="放大 5%"
          >
            <ZoomIn size={20} />
          </button>
          <button 
            onClick={handleZoomOut}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title="缩小 5%"
          >
            <ZoomOut size={20} />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title={isFullscreen ? '退出全屏' : '全屏显示'}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button 
            onClick={toggleLabels}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title={showLabels ? '隐藏标签' : '显示标签'}
          >
            {showLabels ? <Check size={20} /> : <Share2 size={20} style={{ opacity: 0 }} />}
            <span className="absolute text-[8px] font-bold">文</span>
          </button>
          <div className="h-px bg-slate-100 my-1" />
          <button 
            onClick={() => setShowFilterModal(true)}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title="筛选"
          >
            <Filter size={20} />
          </button>
          <button 
            onClick={enterShareMode}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-night-royal shadow-xl shadow-black/5 transition-all"
            title="分享"
          >
            <Share2 size={20} />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute top-8 right-8 glass-card p-4 rounded-[24px] space-y-3">
          {Object.entries(groupLabels).map(([group, label]) => (
            <div key={group} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: groupColors[parseInt(group)] }} />
              <span className="text-xs font-bold text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        {/* 筛选模态框 */}
        <AnimatePresence>
          {showFilterModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowFilterModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-8 max-w-md w-full mx-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-night-deep">筛选节点类型</h3>
                  <button
                    onClick={() => setShowFilterModal(false)}
                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-3">
                  {Object.entries(groupLabels).map(([group, label]) => (
                    <button
                      key={group}
                      onClick={() => toggleGroup(parseInt(group))}
                      className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all ${
                        activeGroups.has(parseInt(group))
                          ? 'bg-night-royal text-white shadow-lg shadow-night-royal/20'
                          : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: activeGroups.has(parseInt(group)) ? '#fff' : groupColors[parseInt(group)] }} />
                        <span className="font-bold">{label}</span>
                      </div>
                      {activeGroups.has(parseInt(group)) && <Check size={20} />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setActiveGroups(new Set([1, 2, 3, 4, 5]));
                    applyFilter(new Set([1, 2, 3, 4, 5]));
                  }}
                  className="mt-6 w-full py-4 bg-slate-100 rounded-2xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                >
                  重置筛选
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 分享模态框 */}
        <AnimatePresence>
          {showShareModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowShareModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-8 max-w-md w-full mx-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-night-deep">分享知识图谱</h3>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-slate-500 font-medium mb-4">点击选择要分享的节点</p>
                <div className="max-h-64 overflow-y-auto space-y-2 mb-6">
                  {initialData.nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => toggleNodeSelection(node.id)}
                      className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                        selectedNodes.has(node.id)
                          ? 'bg-night-royal/10 border-2 border-night-royal'
                          : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${
                        selectedNodes.has(node.id) ? 'bg-night-royal' : ''
                      }`} style={{ 
                        backgroundColor: selectedNodes.has(node.id) ? '' : groupColors[node.group] 
                      }} />
                      <span className={`font-bold ${
                        selectedNodes.has(node.id) ? 'text-night-royal' : 'text-slate-700'
                      }`}>{node.label}</span>
                      {selectedNodes.has(node.id) && <Check size={16} className="ml-auto text-night-royal" />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={generateShareLink}
                    disabled={selectedNodes.size === 0}
                    className="flex-1 py-4 bg-night-royal text-white rounded-2xl font-bold hover:bg-night-royal/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Share2 size={18} />
                    生成分享链接
                  </button>
                  <button
                    onClick={() => {
                      setSelectedNodes(new Set());
                      if (svgRef_current.current) {
                        svgRef_current.current.selectAll('.node-circle')
                          .attr('stroke-width', 4)
                          .attr('stroke', '#fff');
                      }
                    }}
                    className="py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    重置
                  </button>
                </div>
                {shareUrl && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                    <p className="text-xs font-bold text-slate-400 mb-2">分享链接</p>
                    <p className="text-sm text-night-royal break-all">{shareUrl}</p>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
